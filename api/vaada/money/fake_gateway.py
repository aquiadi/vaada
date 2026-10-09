"""FakeGateway: a stand-in for Razorpay Route in dev, demo and tests.

It keeps Razorpay-shaped JSON and emits Razorpay-shaped, signed webhooks, so the code that reads
money state is the same code that will read real Razorpay. It simulates captures, fees, transfers on
hold, hold expiry (lazily, from the clock, so nobody has to act for money to release), settlement,
reversals, refunds with idempotency keys, failed transfers, linked account review and webhooks that
can arrive late, twice or out of order.
"""

import hashlib
import hmac
import json
import secrets
import string
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Literal

from vaada.clock import Clock
from vaada.money.checkout import checkout_config
from vaada.money.entities import (
    order_from,
    payment_from,
    product_from,
    refund_from,
    reversal_from,
    to_unix,
    transfer_from,
)
from vaada.money.fake_store import FakeStore, FakeTx, QueuedEvent
from vaada.money.fees import ceil_bps
from vaada.money.gateway import (
    CheckoutConfig,
    GatewayError,
    GatewayRejectedError,
    LinkedAccountProfile,
    Order,
    Payment,
    ProductConfig,
    Refund,
    Reversal,
    SettlementDetails,
    Transfer,
    TransferRequest,
)

PLATFORM_ACCOUNT = "acc_FAKEPLATFORM01"
ALPHABET = string.ascii_letters + string.digits


def _id(prefix: str) -> str:
    return prefix + "".join(secrets.choice(ALPHABET) for _ in range(14))


def _valid_pan(pan: str) -> bool:
    return len(pan) == 10 and pan[:5].isalpha() and pan[5:9].isdigit() and pan[9].isalpha() and pan.isupper()


def _valid_ifsc(ifsc: str) -> bool:
    return len(ifsc) == 11 and ifsc[:4].isalpha() and ifsc[4] == "0" and ifsc.isalnum() and ifsc.isupper()


@dataclass(frozen=True)
class FakeDelivery:
    seq: int
    event_id: str
    event_type: str
    body: bytes
    signature: str


class FakeGateway:
    kind: Literal["fake"] = "fake"

    def __init__(
        self,
        store: FakeStore,
        clock: Clock,
        *,
        key_id: str,
        key_secret: str,
        webhook_secret: str,
        gateway_fee_bps: int,
        route_transfer_fee_bps: int,
        activation_delay: timedelta = timedelta(seconds=5),
        settlement_delay: timedelta = timedelta(days=2),
    ) -> None:
        self._store = store
        self._clock = clock
        self.key_id = key_id
        self._key_secret = key_secret
        self._webhook_secret = webhook_secret
        self.fee_bps = gateway_fee_bps
        self.route_fee_bps = route_transfer_fee_bps
        self._activation_delay = activation_delay
        self._settlement_delay = settlement_delay
        self._faults: dict[str, list[GatewayError]] = {}

    def fail_next(self, operation: str, error: GatewayError, times: int = 1) -> None:
        """Tests: make the next `times` calls of `operation` raise `error` before touching any state."""
        self._faults.setdefault(operation, []).extend([error] * times)

    def _maybe_fail(self, operation: str) -> None:
        queue = self._faults.get(operation)
        if queue:
            raise queue.pop(0)

    def _now(self) -> datetime:
        return self._clock.now()

    def _event(
        self, name: str, entities: dict[str, dict[str, Any]], account_id: str = PLATFORM_ACCOUNT
    ) -> dict[str, Any]:
        return {
            "id": _id("evt_"),
            "entity": "event",
            "account_id": account_id,
            "event": name,
            "contains": list(entities),
            "payload": {key: {"entity": value} for key, value in entities.items()},
            "created_at": to_unix(self._now()),
        }

    async def _emit(
        self,
        tx: FakeTx,
        name: str,
        entities: dict[str, dict[str, Any]],
        *,
        account_id: str = PLATFORM_ACCOUNT,
        delay: timedelta = timedelta(0),
    ) -> None:
        await tx.emit(self._event(name, entities, account_id), self._now() + delay)

    async def _merchant(self, tx: FakeTx) -> dict[str, Any]:
        return await tx.get("merchant", "platform") or {"id": "platform", "balance": 0}

    async def _require(self, tx: FakeTx, kind: str, id_: str) -> dict[str, Any]:
        found = await tx.get(kind, id_)
        if found is None:
            raise GatewayRejectedError(f"The id provided does not exist: {id_}", code="BAD_REQUEST_ERROR")
        return found

    # Orders and payments

    async def create_order(
        self, *, amount_paise: int, receipt: str, transfers: list[TransferRequest], notes: dict[str, str]
    ) -> Order:
        self._maybe_fail("create_order")
        if amount_paise < 100:
            raise GatewayRejectedError("Order amount less than minimum amount allowed")
        if sum(t.amount_paise for t in transfers) > amount_paise:
            raise GatewayRejectedError("Sum of transfer amounts exceeds the order amount")
        async with self._store.atomic() as tx:
            for t in transfers:
                for product in await tx.all("product"):
                    if product["account_id"] == t.account_id:
                        await self._decide_if_due(tx, product)
                account = await tx.get("account", t.account_id)
                if account is None or account.get("route_status") != "activated":
                    raise GatewayRejectedError(f"Linked account {t.account_id} is not activated for Route")
            order = {
                "id": _id("order_"),
                "entity": "order",
                "amount": amount_paise,
                "amount_paid": 0,
                "amount_due": amount_paise,
                "currency": "INR",
                "receipt": receipt,
                "status": "created",
                "notes": notes,
                "created_at": to_unix(self._now()),
                "transfers": [
                    {
                        "account": t.account_id,
                        "amount": t.amount_paise,
                        "currency": "INR",
                        "notes": t.notes,
                        "on_hold": t.on_hold,
                    }
                    for t in transfers
                ],
            }
            await tx.put("order", order["id"], order)
            return order_from(order)

    async def fetch_order(self, order_id: str) -> Order:
        async with self._store.atomic() as tx:
            return order_from(await self._require(tx, "order", order_id))

    def fee_for(self, amount_paise: int) -> tuple[int, int]:
        """Razorpay's fee on the full captured amount, GST included, and the GST part of it."""
        fee = ceil_bps(amount_paise, self.fee_bps)
        return fee, fee * 18 // 118

    async def simulate_checkout(
        self,
        order_id: str,
        *,
        method: Literal["upi", "netbanking", "card"] = "upi",
        succeed: bool = True,
        email: str = "client@example.com",
    ) -> dict[str, str]:
        """The client pays in Checkout. Returns what Checkout hands the browser on success."""
        async with self._store.atomic() as tx:
            order = await self._require(tx, "order", order_id)
            if order["status"] == "paid":
                raise GatewayRejectedError("Order is already paid")
            if method == "upi" and order["amount"] > 10_000_000:
                raise GatewayRejectedError("UPI payments above ₹1,00,000 are not supported")
            now = self._now()
            fee, tax = self.fee_for(order["amount"])
            payment: dict[str, Any] = {
                "id": _id("pay_"),
                "entity": "payment",
                "amount": order["amount"],
                "currency": "INR",
                "status": "authorized",
                "order_id": order_id,
                "method": method,
                "captured": False,
                "international": False,
                "amount_refunded": 0,
                "refund_status": None,
                "email": email,
                "contact": "+919999999999",
                "fee": None,
                "tax": None,
                "error_code": None,
                "error_description": None,
                "error_reason": None,
                "created_at": to_unix(now),
            }
            order["status"] = "attempted"
            if not succeed:
                payment.update(
                    status="failed",
                    error_code="BAD_REQUEST_ERROR",
                    error_description="Payment was declined by the bank",
                    error_reason="payment_failed",
                )
                await tx.put("payment", payment["id"], payment)
                await tx.put("order", order_id, order)
                await self._emit(tx, "payment.failed", {"payment": payment})
                raise GatewayRejectedError("Payment was declined by the bank", reason="payment_failed")

            await self._emit(tx, "payment.authorized", {"payment": dict(payment)})
            payment.update(status="captured", captured=True, captured_at=to_unix(now), fee=fee, tax=tax)
            order.update(status="paid", amount_paid=order["amount"], amount_due=0)
            await tx.put("payment", payment["id"], payment)
            await tx.put("order", order_id, order)

            merchant = await self._merchant(tx)
            merchant["balance"] += payment["amount"] - fee
            transferable = payment["amount"] - fee
            transfers: list[dict[str, Any]] = []
            for spec in order.get("transfers", []):
                route_fee = ceil_bps(spec["amount"], self.route_fee_bps)
                transfer: dict[str, Any] = {
                    "id": _id("trf_"),
                    "entity": "transfer",
                    "status": "processed",
                    "source": payment["id"],
                    "recipient": spec["account"],
                    "amount": spec["amount"],
                    "currency": "INR",
                    "amount_reversed": 0,
                    "notes": spec.get("notes") or {},
                    "linked_account_notes": [],
                    "on_hold": bool(spec.get("on_hold")),
                    "on_hold_until": None,
                    "settlement_status": "on_hold" if spec.get("on_hold") else "pending",
                    "recipient_settlement_id": None,
                    "created_at": to_unix(now),
                    "processed_at": to_unix(now),
                    "released_at": None if spec.get("on_hold") else to_unix(now),
                    "error": {"code": None, "description": None, "reason": None, "field": None, "step": None},
                }
                if spec["amount"] + route_fee > transferable:
                    transfer.update(
                        status="failed",
                        processed_at=None,
                        settlement_status=None,
                        error={
                            "code": "BAD_REQUEST_ERROR",
                            "description": "Insufficient balance to process the transfer",
                            "reason": "insufficient_balance",
                            "field": "amount",
                            "step": "balance_check",
                        },
                    )
                else:
                    transferable -= spec["amount"] + route_fee
                    merchant["balance"] -= spec["amount"] + route_fee
                await tx.put("transfer", transfer["id"], transfer)
                transfers.append(transfer)
            await tx.put("merchant", "platform", merchant)

            await self._emit(tx, "payment.captured", {"payment": payment})
            await self._emit(tx, "order.paid", {"payment": payment, "order": order})
            for transfer in transfers:
                name = "transfer.processed" if transfer["status"] == "processed" else "transfer.failed"
                await self._emit(tx, name, {"transfer": transfer})

        signature = hmac.new(
            self._key_secret.encode(), f"{order_id}|{payment['id']}".encode(), hashlib.sha256
        ).hexdigest()
        return {"razorpay_order_id": order_id, "razorpay_payment_id": payment["id"], "razorpay_signature": signature}

    async def fetch_payment(self, payment_id: str) -> Payment:
        async with self._store.atomic() as tx:
            return payment_from(await self._require(tx, "payment", payment_id))

    # Transfers

    def _settle_lazily(self, transfer: dict[str, Any]) -> bool:
        """Applies what time alone does to a transfer: a hold that reaches on_hold_until lifts, and a
        lifted hold settles to the linked account after the settlement delay. Returns True if changed."""
        if transfer["status"] not in ("processed", "partially_reversed"):
            return False
        now = to_unix(self._now())
        changed = False
        until = transfer.get("on_hold_until")
        if transfer["on_hold"] and until is not None and until <= now:
            transfer.update(on_hold=False, settlement_status="pending", released_at=until)
            changed = True
        released = transfer.get("released_at")
        if (
            not transfer["on_hold"]
            and transfer.get("settlement_status") == "pending"
            and released is not None
            and released + int(self._settlement_delay.total_seconds()) <= now
        ):
            transfer.update(settlement_status="settled", recipient_settlement_id=_id("setl_"))
            changed = True
        return changed

    async def _load_transfer(self, tx: FakeTx, transfer_id: str) -> dict[str, Any]:
        transfer = await self._require(tx, "transfer", transfer_id)
        if self._settle_lazily(transfer):
            await tx.put("transfer", transfer_id, transfer)
        return transfer

    async def fetch_payment_transfers(self, payment_id: str) -> list[Transfer]:
        self._maybe_fail("fetch_payment_transfers")
        async with self._store.atomic() as tx:
            ids = [t["id"] for t in await tx.all("transfer") if t.get("source") == payment_id]
            return [transfer_from(await self._load_transfer(tx, i)) for i in sorted(ids)]

    async def fetch_transfer(self, transfer_id: str) -> Transfer:
        self._maybe_fail("fetch_transfer")
        async with self._store.atomic() as tx:
            return transfer_from(await self._load_transfer(tx, transfer_id))

    async def set_transfer_hold(self, transfer_id: str, *, on_hold: bool, until: datetime | None) -> Transfer:
        self._maybe_fail("set_transfer_hold")
        async with self._store.atomic() as tx:
            transfer = await self._load_transfer(tx, transfer_id)
            if transfer["status"] == "failed":
                raise GatewayRejectedError("Transfer failed and cannot be modified")
            if transfer.get("settlement_status") == "settled":
                raise GatewayRejectedError("Settlement for this transfer has already been processed")
            now = self._now()
            if on_hold:
                if until is not None and until <= now:
                    raise GatewayRejectedError("on_hold_until should be a future timestamp")
                transfer.update(
                    on_hold=True,
                    on_hold_until=to_unix(until) if until else None,
                    settlement_status="on_hold",
                    released_at=None,
                )
            else:
                transfer.update(
                    on_hold=False, on_hold_until=None, settlement_status="pending", released_at=to_unix(now)
                )
            await tx.put("transfer", transfer_id, transfer)
            return transfer_from(transfer)

    async def reverse_transfer(self, transfer_id: str, *, amount_paise: int, idempotency_key: str) -> Reversal:
        self._maybe_fail("reverse_transfer")
        async with self._store.atomic() as tx:
            for existing in await tx.all("reversal"):
                if existing["transfer_id"] == transfer_id and existing["notes"].get("vaada_key") == idempotency_key:
                    return reversal_from(existing)
            transfer = await self._load_transfer(tx, transfer_id)
            if transfer["status"] == "failed":
                raise GatewayRejectedError("A failed transfer cannot be reversed")
            if transfer.get("settlement_status") == "settled":
                raise GatewayRejectedError("Insufficient balance in the linked account", reason="insufficient_balance")
            remaining = transfer["amount"] - transfer["amount_reversed"]
            if amount_paise <= 0 or amount_paise > remaining:
                raise GatewayRejectedError("The reversal amount exceeds the amount left on the transfer")
            reversal = {
                "id": _id("rvrsl_"),
                "entity": "reversal",
                "transfer_id": transfer_id,
                "amount": amount_paise,
                "fee": 0,
                "tax": 0,
                "currency": "INR",
                "notes": {"vaada_key": idempotency_key},
                "initiator_id": PLATFORM_ACCOUNT,
                "customer_refund_id": None,
                "created_at": to_unix(self._now()),
            }
            transfer["amount_reversed"] += amount_paise
            transfer["status"] = (
                "reversed" if transfer["amount_reversed"] == transfer["amount"] else "partially_reversed"
            )
            merchant = await self._merchant(tx)
            merchant["balance"] += amount_paise
            await tx.put("reversal", reversal["id"], reversal)
            await tx.put("transfer", transfer_id, transfer)
            await tx.put("merchant", "platform", merchant)
            return reversal_from(reversal)

    # Refunds

    async def refund_payment(
        self, payment_id: str, *, amount_paise: int, idempotency_key: str, notes: dict[str, str]
    ) -> Refund:
        self._maybe_fail("refund_payment")
        async with self._store.atomic() as tx:
            for existing in await tx.all("refund"):
                if existing.get("idempotency_key") == idempotency_key:
                    if existing["payment_id"] != payment_id or existing["amount"] != amount_paise:
                        raise GatewayRejectedError("Idempotency key reused with a different request")
                    return refund_from(existing)
            payment = await self._require(tx, "payment", payment_id)
            if payment["status"] not in ("captured", "refunded"):
                raise GatewayRejectedError("Only captured payments can be refunded")
            if amount_paise <= 0 or amount_paise > payment["amount"] - payment["amount_refunded"]:
                raise GatewayRejectedError("The refund amount exceeds the amount left on the payment")
            merchant = await self._merchant(tx)
            if merchant["balance"] < amount_paise:
                raise GatewayRejectedError(
                    "Your account does not have enough balance to carry out the refund operation"
                )
            refund = {
                "id": _id("rfnd_"),
                "entity": "refund",
                "amount": amount_paise,
                "currency": "INR",
                "payment_id": payment_id,
                "notes": notes,
                "receipt": None,
                "status": "processed",
                "speed_processed": "normal",
                "idempotency_key": idempotency_key,
                "created_at": to_unix(self._now()),
            }
            merchant["balance"] -= amount_paise
            payment["amount_refunded"] += amount_paise
            payment["refund_status"] = "full" if payment["amount_refunded"] == payment["amount"] else "partial"
            await tx.put("refund", refund["id"], refund)
            await tx.put("payment", payment_id, payment)
            await tx.put("merchant", "platform", merchant)
            public = {k: v for k, v in refund.items() if k != "idempotency_key"}
            await self._emit(tx, "refund.created", {"refund": {**public, "status": "pending"}, "payment": payment})
            await self._emit(tx, "refund.processed", {"refund": public, "payment": payment})
            return refund_from(refund)

    async def fetch_refund(self, payment_id: str, refund_id: str) -> Refund:
        async with self._store.atomic() as tx:
            refund = await self._require(tx, "refund", refund_id)
            if refund["payment_id"] != payment_id:
                raise GatewayRejectedError("The refund does not belong to this payment")
            return refund_from(refund)

    async def merchant_balance(self) -> int:
        async with self._store.atomic() as tx:
            return int((await self._merchant(tx))["balance"])

    # Linked accounts

    async def create_linked_account(self, profile: LinkedAccountProfile) -> str:
        self._maybe_fail("create_linked_account")
        if not _valid_pan(profile.pan):
            raise GatewayRejectedError("The PAN is invalid", reason="invalid_pan")
        async with self._store.atomic() as tx:
            account = {
                "id": _id("acc_"),
                "type": "route",
                "status": "created",
                "email": profile.email,
                "reference_id": profile.reference_id,
                "legal_business_name": profile.legal_name,
                "business_type": profile.business_type,
                "pan_last4": profile.pan[-4:],
                "route_status": None,
                "created_at": to_unix(self._now()),
            }
            await tx.put("account", account["id"], account)
            return str(account["id"])

    async def create_stakeholder(self, account_id: str, *, name: str, email: str, pan: str) -> str:
        self._maybe_fail("create_stakeholder")
        if not _valid_pan(pan):
            raise GatewayRejectedError("The PAN is invalid", reason="invalid_pan")
        async with self._store.atomic() as tx:
            await self._require(tx, "account", account_id)
            stakeholder = {"id": _id("sth_"), "account_id": account_id, "name": name, "email": email}
            await tx.put("stakeholder", stakeholder["id"], stakeholder)
            return str(stakeholder["id"])

    async def request_route_product(self, account_id: str) -> ProductConfig:
        self._maybe_fail("request_route_product")
        async with self._store.atomic() as tx:
            await self._require(tx, "account", account_id)
            product = {
                "id": _id("acc_prd_"),
                "account_id": account_id,
                "product_name": "route",
                "activation_status": "requested",
                "requirements": [
                    {
                        "field_reference": "settlements.account_number",
                        "resolution_url": "",
                        "status": "required",
                        "reason_code": "field_missing",
                    },
                    {
                        "field_reference": "settlements.ifsc_code",
                        "resolution_url": "",
                        "status": "required",
                        "reason_code": "field_missing",
                    },
                    {
                        "field_reference": "settlements.beneficiary_name",
                        "resolution_url": "",
                        "status": "required",
                        "reason_code": "field_missing",
                    },
                ],
                "decide_at": None,
                "outcome": None,
            }
            await tx.put("product", product["id"], product)
            return product_from(product)

    async def update_route_settlement(
        self, account_id: str, product_id: str, details: SettlementDetails
    ) -> ProductConfig:
        self._maybe_fail("update_route_settlement")
        if not _valid_ifsc(details.ifsc):
            raise GatewayRejectedError("The IFSC code is invalid", reason="invalid_ifsc")
        if not (details.account_number.isdigit() and 9 <= len(details.account_number) <= 18):
            raise GatewayRejectedError("The bank account number is invalid", reason="invalid_account_number")
        async with self._store.atomic() as tx:
            product = await self._require(tx, "product", product_id)
            # Penny testing fails for accounts ending 0000, so the needs-clarification path can be walked in dev.
            outcome = "needs_clarification" if details.account_number.endswith("0000") else "activated"
            product.update(
                activation_status="under_review",
                requirements=[],
                decide_at=to_unix(self._now() + self._activation_delay),
                outcome=outcome,
                bank_last4=details.account_number[-4:],
            )
            await tx.put("product", product_id, product)
            await self._emit(
                tx,
                "product.route.under_review",
                {"merchant_product": self._public_product(product)},
                account_id=account_id,
            )
            decided = self._decided(product)
            name = f"product.route.{decided['activation_status']}"
            await self._emit(
                tx,
                name,
                {"merchant_product": self._public_product(decided)},
                account_id=account_id,
                delay=self._activation_delay,
            )
            return product_from(product)

    def _decided(self, product: dict[str, Any]) -> dict[str, Any]:
        decided = dict(product)
        if decided.get("outcome") == "activated":
            decided.update(activation_status="activated", requirements=[])
        else:
            decided.update(
                activation_status="needs_clarification",
                requirements=[
                    {
                        "field_reference": "settlements.account_number",
                        "resolution_url": "",
                        "status": "required",
                        "reason_code": "penny_testing_failed",
                        "description": "The bank could not verify this account. Check the account number and IFSC.",
                    }
                ],
            )
        return decided

    @staticmethod
    def _public_product(product: dict[str, Any]) -> dict[str, Any]:
        return {k: v for k, v in product.items() if k not in ("decide_at", "outcome")}

    async def _decide_if_due(self, tx: FakeTx, product: dict[str, Any]) -> dict[str, Any]:
        """What Razorpay's review team does on its own time: decide an account whose review is over."""
        decide_at = product.get("decide_at")
        if product["activation_status"] != "under_review" or decide_at is None or decide_at > to_unix(self._now()):
            return product
        product = self._decided(product)
        product["decide_at"] = None
        await tx.put("product", product["id"], product)
        if product["activation_status"] == "activated":
            account = await self._require(tx, "account", product["account_id"])
            account["route_status"] = "activated"
            await tx.put("account", account["id"], account)
        return product

    async def fetch_route_product(self, account_id: str, product_id: str) -> ProductConfig:
        async with self._store.atomic() as tx:
            product = await self._decide_if_due(tx, await self._require(tx, "product", product_id))
            return product_from(product, account_id)

    async def activate_due_products(self) -> None:
        async with self._store.atomic() as tx:
            for product in await tx.all("product"):
                await self._decide_if_due(tx, product)

    # Signatures and webhooks

    def _sign(self, secret: str, body: bytes) -> str:
        return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()

    def verify_webhook_signature(self, body: bytes, signature: str) -> bool:
        return hmac.compare_digest(self._sign(self._webhook_secret, body), signature)

    def verify_checkout_signature(self, *, order_id: str, payment_id: str, signature: str) -> bool:
        expected = self._sign(self._key_secret, f"{order_id}|{payment_id}".encode())
        return hmac.compare_digest(expected, signature)

    def checkout_config(
        self, *, order: Order, upi_limit_paise: int, prefill: dict[str, str], description: str
    ) -> CheckoutConfig:
        return checkout_config(
            key_id=self.key_id, order=order, upi_limit_paise=upi_limit_paise, prefill=prefill, description=description
        )

    def delivery_for(self, queued: QueuedEvent) -> FakeDelivery:
        body = json.dumps({k: v for k, v in queued.event.items() if k != "id"}, separators=(",", ":")).encode()
        return FakeDelivery(
            seq=queued.seq,
            event_id=queued.event["id"],
            event_type=queued.event["event"],
            body=body,
            signature=self._sign(self._webhook_secret, body),
        )

    async def due_deliveries(self, limit: int = 50) -> list[FakeDelivery]:
        await self.activate_due_products()
        return [self.delivery_for(q) for q in await self._store.due_events(self._now(), limit)]

    async def mark_delivered(self, seq: int) -> None:
        await self._store.mark_delivered(seq, self._now())

    async def retry_later(self, seq: int, delay: timedelta) -> None:
        await self._store.retry_later(seq, self._now() + delay)

    async def seed_activated_account(self, *, legal_name: str, email: str, bank_last4: str) -> tuple[str, str, str]:
        """Dev and demo seeding: a linked account that has already passed review."""
        async with self._store.atomic() as tx:
            account_id, stakeholder_id, product_id = _id("acc_"), _id("sth_"), _id("acc_prd_")
            await tx.put(
                "account",
                account_id,
                {
                    "id": account_id,
                    "type": "route",
                    "status": "activated",
                    "email": email,
                    "legal_business_name": legal_name,
                    "business_type": "individual",
                    "route_status": "activated",
                    "created_at": to_unix(self._now()),
                },
            )
            await tx.put(
                "stakeholder",
                stakeholder_id,
                {"id": stakeholder_id, "account_id": account_id, "name": legal_name, "email": email},
            )
            await tx.put(
                "product",
                product_id,
                {
                    "id": product_id,
                    "account_id": account_id,
                    "product_name": "route",
                    "activation_status": "activated",
                    "requirements": [],
                    "decide_at": None,
                    "outcome": "activated",
                    "bank_last4": bank_last4,
                },
            )
            return account_id, stakeholder_id, product_id
