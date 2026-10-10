"""Against Razorpay's real test mode. Opt in with `make test-razorpay`; GO_LIVE.md says how to get each value.

RAZORPAY_TEST_KEY_ID, RAZORPAY_TEST_KEY_SECRET   required for everything here
RAZORPAY_TEST_LINKED_ACCOUNT_ID                   an activated Route linked account in test mode (acc_...)
RAZORPAY_TEST_PAYMENT_ID                          a captured test payment on an order with held transfers (pay_...);
                                                  the suite reverses and refunds one rupee of it
RAZORPAY_TEST_ONBOARDING=1                        also create a linked account (each run makes a new one)
"""

import os
import uuid
from datetime import UTC, datetime, timedelta

import pytest

from vaada.money.fees import assert_transfers_fit, deal_money
from vaada.money.gateway import LinkedAccountProfile, SettlementDetails, TransferRequest
from vaada.money.razorpay_gateway import RazorpayGateway

pytestmark = pytest.mark.razorpay_test_mode

ONE_RUPEE = 100


def need(name: str) -> str:
    value = os.environ.get(name, "")
    if not value:
        pytest.skip(f"set {name} to run this")
    return value


@pytest.fixture
def gateway() -> RazorpayGateway:
    key_id = need("RAZORPAY_TEST_KEY_ID")
    if not key_id.startswith("rzp_test_"):
        pytest.fail("RAZORPAY_TEST_KEY_ID must be a test-mode key (rzp_test_...)")
    return RazorpayGateway(key_id=key_id, key_secret=need("RAZORPAY_TEST_KEY_SECRET"), webhook_secret="unused")


async def test_order_with_held_transfers_is_accepted(gateway: RazorpayGateway) -> None:
    account = need("RAZORPAY_TEST_LINKED_ACCOUNT_ID")
    money = deal_money([1_000_00, 1_500_00], client_fee_bps=242, platform_fee_bps=0, tds_bps=0)
    assert_transfers_fit(money, gateway_fee_bps=236, route_transfer_fee_bps=0)
    receipt = f"vaada-test-{uuid.uuid4().hex[:12]}"
    order = await gateway.create_order(
        amount_paise=money.order_paise,
        receipt=receipt,
        transfers=[
            TransferRequest(account_id=account, amount_paise=m.transfer_paise, notes={"milestone_id": f"test-{i}"})
            for i, m in enumerate(money.milestones, start=1)
        ],
        notes={"deal_id": "test"},
    )
    fetched = await gateway.fetch_order(order.id)
    assert fetched.amount_paise == money.order_paise == 256_050
    assert fetched.status == "created"
    assert fetched.receipt == receipt


async def test_a_paid_orders_transfers_are_held(gateway: RazorpayGateway) -> None:
    payment = await gateway.fetch_payment(need("RAZORPAY_TEST_PAYMENT_ID"))
    assert payment.status == "captured"
    transfers = await gateway.fetch_payment_transfers(payment.id)
    assert transfers, "the payment's order had no transfers"
    for transfer in transfers:
        assert transfer.on_hold or transfer.amount_reversed_paise == transfer.amount_paise
    assert sum(t.amount_paise for t in transfers) <= payment.amount_paise - (payment.fee_paise or 0)


async def test_a_hold_can_be_given_an_end_and_made_indefinite_again(gateway: RazorpayGateway) -> None:
    transfers = await gateway.fetch_payment_transfers(need("RAZORPAY_TEST_PAYMENT_ID"))
    transfer = next(t for t in transfers if t.on_hold)
    until = (datetime.now(UTC) + timedelta(days=10)).replace(microsecond=0)
    timed = await gateway.set_transfer_hold(transfer.id, on_hold=True, until=until)
    assert timed.on_hold and timed.on_hold_until == until
    indefinite = await gateway.set_transfer_hold(transfer.id, on_hold=True, until=None)
    assert indefinite.on_hold
    refetched = await gateway.fetch_transfer(transfer.id)
    assert refetched.on_hold and not refetched.hold_lifted(datetime.now(UTC) + timedelta(days=30))


async def test_reversal_with_the_same_key_happens_once(gateway: RazorpayGateway) -> None:
    payment_id = need("RAZORPAY_TEST_PAYMENT_ID")
    transfer = next(t for t in await gateway.fetch_payment_transfers(payment_id) if t.on_hold)
    key = f"vaada-test-reversal-{transfer.id}"
    first = await gateway.reverse_transfer(transfer.id, amount_paise=ONE_RUPEE, idempotency_key=key)
    again = await gateway.reverse_transfer(transfer.id, amount_paise=ONE_RUPEE, idempotency_key=key)
    assert first.id == again.id
    assert first.amount_paise == ONE_RUPEE


async def test_refund_with_the_same_key_happens_once(gateway: RazorpayGateway) -> None:
    payment_id = need("RAZORPAY_TEST_PAYMENT_ID")
    key = f"vaada-test-refund-{payment_id}"
    first = await gateway.refund_payment(payment_id, amount_paise=ONE_RUPEE, idempotency_key=key, notes={"test": "1"})
    again = await gateway.refund_payment(payment_id, amount_paise=ONE_RUPEE, idempotency_key=key, notes={"test": "1"})
    assert first.id == again.id
    fetched = await gateway.fetch_refund(payment_id, first.id)
    assert fetched.amount_paise == ONE_RUPEE
    assert fetched.status in {"pending", "processed"}


async def test_linked_account_onboarding_reaches_review(gateway: RazorpayGateway) -> None:
    if os.environ.get("RAZORPAY_TEST_ONBOARDING") != "1":
        pytest.skip("set RAZORPAY_TEST_ONBOARDING=1 to create a test linked account")
    suffix = uuid.uuid4().hex[:8]
    profile = LinkedAccountProfile(
        email=f"vaada-test-{suffix}@example.com",
        phone="9000090000",
        legal_name="Vaada Test Maker",
        business_type="individual",
        pan="AAAPL1234C",
        street1="12 MG Road",
        street2="Palasia",
        city="Indore",
        state="Madhya Pradesh",
        postal_code="452001",
        reference_id=f"vaada-test-{suffix}",
    )
    account_id = await gateway.create_linked_account(profile)
    assert account_id.startswith("acc_")
    await gateway.create_stakeholder(account_id, name=profile.legal_name, email=profile.email, pan=profile.pan)
    product = await gateway.request_route_product(account_id)
    product = await gateway.update_route_settlement(
        account_id,
        product.id,
        SettlementDetails(account_number="1234567890", ifsc="HDFC0000001", beneficiary_name=profile.legal_name),
    )
    fetched = await gateway.fetch_route_product(account_id, product.id)
    assert fetched.activation_status in {"under_review", "needs_clarification", "activated"}
