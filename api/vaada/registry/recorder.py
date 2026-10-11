"""Posts queued records to VaadaRegistry. Runs only in the worker; money never waits for it. If the chain
is down, records stay queued and retry with backoff, and the UI keeps saying "Recording..."."""

import logging
from datetime import timedelta
from typing import Any, cast

from eth_account import Account
from eth_typing import HexStr
from sqlalchemy import select
from web3 import AsyncHTTPProvider, AsyncWeb3
from web3.exceptions import TimeExhausted, TransactionNotFound, Web3Exception
from web3.types import TxParams

from vaada.config import Settings
from vaada.context import AppContext
from vaada.db import transaction
from vaada.models import RegistryRecord
from vaada.models.enums import RegistryKind, RegistryStatus

log = logging.getLogger(__name__)

REGISTRY_ABI: list[dict[str, Any]] = [
    {
        "type": "function",
        "name": "record",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "dealHash", "type": "bytes32"},
            {"name": "makerId", "type": "bytes32"},
            {"name": "kind", "type": "uint8"},
            {"name": "ref", "type": "bytes32"},
        ],
        "outputs": [],
    },
    {
        "type": "event",
        "name": "Recorded",
        "anonymous": False,
        "inputs": [
            {"name": "dealHash", "type": "bytes32", "indexed": True},
            {"name": "makerId", "type": "bytes32", "indexed": True},
            {"name": "kind", "type": "uint8", "indexed": False},
            {"name": "ref", "type": "bytes32", "indexed": False},
            {"name": "at", "type": "uint64", "indexed": False},
        ],
    },
]

MAX_ATTEMPTS = 10
POLYGON_CHAINS = {137, 80002}


def backoff(attempts: int) -> timedelta:
    return timedelta(seconds=min(30 * 2 ** max(attempts - 1, 0), 3600))


class Recorder:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._w3 = AsyncWeb3(AsyncHTTPProvider(settings.chain_rpc_url, request_kwargs={"timeout": 20}))
        self._account = Account.from_key(settings.recorder_private_key)
        self._contract = self._w3.eth.contract(
            address=AsyncWeb3.to_checksum_address(settings.registry_address), abi=REGISTRY_ABI
        )

    async def _fees(self) -> dict[str, int]:
        block = await self._w3.eth.get_block("latest")
        base = int(block.get("baseFeePerGas") or 0)
        priority = int(await self._w3.eth.max_priority_fee)
        if self._settings.chain_id in POLYGON_CHAINS:
            # Polygon rejects tips under 25 gwei; leave headroom.
            priority = max(priority, 30 * 10**9)
        return {"maxPriorityFeePerGas": priority, "maxFeePerGas": base * 2 + priority}

    async def send(self, record: RegistryRecord) -> str:
        call = self._contract.functions.record(
            bytes.fromhex(record.deal_hash[2:]),
            bytes.fromhex(record.maker_id[2:]),
            RegistryKind(record.kind).code,
            bytes.fromhex(record.ref[2:]),
        )
        nonce = await self._w3.eth.get_transaction_count(self._account.address, "pending")
        params = cast(
            TxParams,
            {"from": self._account.address, "nonce": nonce, "chainId": self._settings.chain_id, **(await self._fees())},
        )
        tx = await call.build_transaction(params)
        tx["gas"] = int(await self._w3.eth.estimate_gas(tx) * 1.2)
        signed = self._account.sign_transaction(tx)
        return "0x" + (await self._w3.eth.send_raw_transaction(signed.raw_transaction)).hex().removeprefix("0x")

    async def receipt(self, tx_hash: str, *, wait_seconds: float) -> int | None:
        try:
            if wait_seconds > 0:
                result = await self._w3.eth.wait_for_transaction_receipt(
                    HexStr(tx_hash), timeout=wait_seconds, poll_latency=0.5
                )
            else:
                result = await self._w3.eth.get_transaction_receipt(HexStr(tx_hash))
        except (TransactionNotFound, TimeExhausted):
            return None
        if int(result["status"]) != 1:
            raise RuntimeError(f"registry transaction {tx_hash} reverted")
        return int(result["blockNumber"])


async def post_pending(
    ctx: AppContext, recorder: Recorder | None, *, limit: int = 20, wait_seconds: float = 15.0
) -> int:
    if recorder is None:
        return 0
    now = ctx.clock.now()
    async with ctx.sessions() as session:
        pending = (
            (
                await session.execute(
                    select(RegistryRecord)
                    .where(
                        RegistryRecord.status.in_((RegistryStatus.QUEUED, RegistryStatus.SENT)),
                        RegistryRecord.next_attempt_at <= now,
                    )
                    .order_by(RegistryRecord.created_at)
                    .limit(limit)
                )
            )
            .scalars()
            .all()
        )
    confirmed = 0
    for record in pending:
        try:
            tx_hash = record.tx_hash
            if record.status == RegistryStatus.QUEUED or tx_hash is None:
                tx_hash = await recorder.send(record)
                await _update(ctx, record.id, status=RegistryStatus.SENT, tx_hash=tx_hash, attempts=record.attempts + 1)
            block = await recorder.receipt(tx_hash, wait_seconds=wait_seconds)
            if block is not None:
                await _update(
                    ctx,
                    record.id,
                    status=RegistryStatus.CONFIRMED,
                    block_number=block,
                    confirmed_at=ctx.clock.now(),
                    last_error=None,
                )
                confirmed += 1
            elif record.status == RegistryStatus.SENT and record.created_at < now - timedelta(minutes=30):
                await _update(
                    ctx,
                    record.id,
                    status=RegistryStatus.QUEUED,
                    tx_hash=None,
                    next_attempt_at=now + backoff(record.attempts),
                )
        except (Web3Exception, ValueError, RuntimeError, OSError) as exc:
            attempts = record.attempts + 1
            log.warning("registry write for %s failed (%s): %s", record.id, attempts, type(exc).__name__)
            await _update(
                ctx,
                record.id,
                status=RegistryStatus.FAILED if attempts >= MAX_ATTEMPTS else RegistryStatus.QUEUED,
                attempts=attempts,
                last_error=f"{type(exc).__name__}: {exc}"[:500],
                next_attempt_at=now + backoff(attempts),
            )
    return confirmed


async def _update(ctx: AppContext, record_id: Any, **values: Any) -> None:
    async with transaction(ctx.sessions) as session:
        stored = await session.get(RegistryRecord, record_id, with_for_update=True)
        assert stored is not None
        for key, value in values.items():
            setattr(stored, key, value)


def make_recorder(settings: Settings) -> Recorder | None:
    return Recorder(settings) if settings.registry_enabled else None
