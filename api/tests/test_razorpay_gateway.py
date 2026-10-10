"""RazorpayGateway's requests, checked without the network: the SDK client is replaced by a recorder, so these
tests pin down exactly what we would send Razorpay."""

import hashlib
import hmac
from datetime import UTC, datetime
from typing import Any

import pytest

from vaada.money.gateway import (
    GatewayRejectedError,
    GatewayUnavailableError,
    LinkedAccountProfile,
    SettlementDetails,
    TransferRequest,
)
from vaada.money.razorpay_gateway import RazorpayGateway

KEY_SECRET = "test_key_secret"
WEBHOOK_SECRET = "test_webhook_secret"


class Recorder:
    def __init__(self, responses: dict[str, Any]) -> None:
        self.calls: list[tuple[str, tuple[Any, ...], dict[str, Any]]] = []
        self._responses = responses

    def __getattr__(self, name: str) -> Any:
        def call(*args: Any, **kwargs: Any) -> Any:
            self.calls.append((name, args, kwargs))
            response = self._responses[name]
            if isinstance(response, Exception):
                raise response
            return response(*args) if callable(response) else response

        return call


def gateway_with(**resources: Recorder) -> RazorpayGateway:
    gateway = RazorpayGateway(key_id="rzp_test_abc", key_secret=KEY_SECRET, webhook_secret=WEBHOOK_SECRET)
    for name, recorder in resources.items():
        setattr(gateway._client, name, recorder)
    return gateway


TRANSFER_JSON = {
    "id": "trf_1",
    "source": "pay_1",
    "recipient": "acc_1",
    "amount": 1_250_000,
    "amount_reversed": 0,
    "on_hold": True,
    "on_hold_until": None,
    "status": "processed",
    "settlement_status": "on_hold",
    "notes": {"milestone_id": "m1"},
}


async def test_order_carries_integer_paise_and_held_transfers() -> None:
    orders = Recorder({"create": {"id": "order_1", "amount": 2_560_500, "status": "created", "receipt": "deal-1"}})
    gateway = gateway_with(order=orders)
    order = await gateway.create_order(
        amount_paise=2_560_500,
        receipt="deal-1",
        transfers=[
            TransferRequest(account_id="acc_1", amount_paise=1_250_000, notes={"milestone_id": "m1", "deal_id": "d1"}),
            TransferRequest(account_id="acc_1", amount_paise=1_250_000, notes={"milestone_id": "m2", "deal_id": "d1"}),
        ],
        notes={"deal_id": "d1"},
    )
    assert order.amount_paise == 2_560_500
    (_, (body,), _) = orders.calls[0]
    assert body["amount"] == 2_560_500 and isinstance(body["amount"], int)
    assert body["currency"] == "INR"
    assert [t["on_hold"] for t in body["transfers"]] == [True, True]
    assert all(isinstance(t["amount"], int) for t in body["transfers"])
    assert body["transfers"][0]["linked_account_notes"] == ["milestone_id", "deal_id"]


async def test_hold_until_is_sent_as_unix_seconds_and_no_until_holds_indefinitely() -> None:
    transfers = Recorder({"edit": TRANSFER_JSON})
    gateway = gateway_with(transfer=transfers)
    until = datetime(2026, 10, 23, 18, 30, tzinfo=UTC)
    await gateway.set_transfer_hold("trf_1", on_hold=True, until=until)
    await gateway.set_transfer_hold("trf_1", on_hold=True, until=None)
    await gateway.set_transfer_hold("trf_1", on_hold=False, until=None)
    bodies = [args[1] for _, args, _ in transfers.calls]
    assert bodies == [
        {"on_hold": True, "on_hold_until": int(until.timestamp())},
        {"on_hold": True},
        {"on_hold": False},
    ]


async def test_reversal_reuses_one_already_made_with_the_same_key() -> None:
    existing = {"items": [{"id": "rvrsl_1", "transfer_id": "trf_1", "amount": 50_000, "notes": {"vaada_key": "k1"}}]}
    transfers = Recorder({"reversals": existing, "reverse": AssertionError("must not reverse twice")})
    reversal = await gateway_with(transfer=transfers).reverse_transfer(
        "trf_1", amount_paise=50_000, idempotency_key="k1"
    )
    assert reversal.id == "rvrsl_1"
    assert [name for name, _, _ in transfers.calls] == ["reversals"]


async def test_reversal_is_made_with_our_key_in_its_notes_when_none_exists() -> None:
    transfers = Recorder(
        {
            "reversals": {"items": []},
            "reverse": {"id": "rvrsl_2", "transfer_id": "trf_1", "amount": 50_000, "notes": {"vaada_key": "k2"}},
        }
    )
    await gateway_with(transfer=transfers).reverse_transfer("trf_1", amount_paise=50_000, idempotency_key="k2")
    name, args, _ = transfers.calls[1]
    assert name == "reverse"
    assert args == ("trf_1", {"amount": 50_000, "notes": {"vaada_key": "k2"}})


async def test_refund_sends_the_idempotency_header() -> None:
    payments = Recorder(
        {"refund": {"id": "rfnd_1", "payment_id": "pay_1", "amount": 60_500, "status": "pending", "notes": {}}}
    )
    await gateway_with(payment=payments).refund_payment(
        "pay_1", amount_paise=60_500, idempotency_key="refund:m1:1", notes={"milestone_id": "m1"}
    )
    _, args, kwargs = payments.calls[0]
    assert args[1]["amount"] == 60_500
    assert args[1]["speed"] == "normal"
    assert kwargs["headers"] == {"X-Refund-Idempotency": "refund:m1:1"}


async def test_a_400_is_a_rejection_and_a_5xx_is_retryable() -> None:
    from razorpay.errors import BadRequestError, ServerError

    rejecting = gateway_with(transfer=Recorder({"fetch": BadRequestError("The ifsc code is invalid")}))
    with pytest.raises(GatewayRejectedError) as rejected:
        await rejecting.fetch_transfer("trf_1")
    assert rejected.value.reason == "invalid_ifsc"

    failing = gateway_with(transfer=Recorder({"fetch": ServerError("upstream")}))
    with pytest.raises(GatewayUnavailableError):
        await failing.fetch_transfer("trf_1")


async def test_onboarding_passes_pan_and_bank_through_without_keeping_them() -> None:
    accounts = Recorder({"create": {"id": "acc_9"}})
    gateway = gateway_with(account=accounts)
    profile = LinkedAccountProfile(
        email="aditi@example.in",
        phone="9800000000",
        legal_name="Aditi Rao",
        business_type="individual",
        pan="ABCPR1234K",
        street1="12 MG Road",
        street2="",
        city="Indore",
        state="Madhya Pradesh",
        postal_code="452001",
        reference_id="maker-1",
    )
    assert await gateway.create_linked_account(profile) == "acc_9"
    body = accounts.calls[0][1][0]
    assert body["legal_info"] == {"pan": "ABCPR1234K"}
    assert body["profile"]["addresses"]["registered"]["state"] == "MADHYA PRADESH"
    assert "ABCPR1234K" not in repr(profile)
    assert "12345678901234" not in repr(SettlementDetails("12345678901234", "HDFC0000001", "Aditi Rao"))


def test_webhook_signature_is_hmac_sha256_of_the_raw_body() -> None:
    gateway = gateway_with()
    body = b'{"event":"payment.captured"}'
    good = hmac.new(WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()
    assert gateway.verify_webhook_signature(body, good)
    assert not gateway.verify_webhook_signature(body + b" ", good)
    assert not gateway.verify_webhook_signature(body, "0" * 64)


def test_checkout_signature_covers_order_and_payment() -> None:
    gateway = gateway_with()
    good = hmac.new(KEY_SECRET.encode(), b"order_1|pay_1", hashlib.sha256).hexdigest()
    assert gateway.verify_checkout_signature(order_id="order_1", payment_id="pay_1", signature=good)
    assert not gateway.verify_checkout_signature(order_id="order_1", payment_id="pay_2", signature=good)
