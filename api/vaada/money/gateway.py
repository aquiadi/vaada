"""The one interface business logic uses to move money. RazorpayGateway and FakeGateway implement it;
nothing else in the codebase may import the Razorpay SDK."""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Literal, Protocol


class GatewayError(Exception):
    """Base for every failure talking to the payments gateway."""


class GatewayUnavailableError(GatewayError):
    """Network trouble or a 5xx. Nothing is known to have changed; the call can be retried."""


class GatewayRejectedError(GatewayError):
    """The gateway refused the request (a 4xx). Retrying the same call will not help."""

    def __init__(self, message: str, *, code: str = "BAD_REQUEST_ERROR", reason: str | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.reason = reason


@dataclass(frozen=True)
class TransferRequest:
    account_id: str
    amount_paise: int
    notes: dict[str, str]
    on_hold: bool = True


@dataclass(frozen=True)
class Order:
    id: str
    amount_paise: int
    status: str
    receipt: str


@dataclass(frozen=True)
class Transfer:
    id: str
    source: str | None
    account_id: str
    amount_paise: int
    amount_reversed_paise: int
    on_hold: bool
    on_hold_until: datetime | None
    status: str
    settlement_status: str | None
    notes: dict[str, str]
    error_reason: str | None = None

    @property
    def milestone_id(self) -> str | None:
        return self.notes.get("milestone_id")

    def hold_lifted(self, now: datetime) -> bool:
        """True once the transfer is free to settle: hold switched off, or its release time has passed."""
        if self.settlement_status == "settled" or not self.on_hold:
            return True
        return self.on_hold_until is not None and self.on_hold_until <= now


@dataclass(frozen=True)
class Reversal:
    id: str
    transfer_id: str
    amount_paise: int
    notes: dict[str, str]


@dataclass(frozen=True)
class Refund:
    id: str
    payment_id: str
    amount_paise: int
    status: str
    notes: dict[str, str]


@dataclass(frozen=True)
class Payment:
    id: str
    order_id: str | None
    amount_paise: int
    status: str
    method: str | None
    fee_paise: int | None
    tax_paise: int | None
    captured_at: datetime | None
    international: bool = False
    card_network: str | None = None
    error_reason: str | None = None


@dataclass(frozen=True)
class LinkedAccountProfile:
    """Passed straight through to Razorpay. PAN and the account number are never stored or logged."""

    email: str
    phone: str
    legal_name: str
    business_type: Literal["individual", "proprietorship"]
    pan: str
    street1: str
    street2: str
    city: str
    state: str
    postal_code: str
    reference_id: str

    def __repr__(self) -> str:
        return f"LinkedAccountProfile(reference_id={self.reference_id!r}, business_type={self.business_type!r})"


@dataclass(frozen=True)
class SettlementDetails:
    account_number: str
    ifsc: str
    beneficiary_name: str

    def __repr__(self) -> str:
        return f"SettlementDetails(ifsc={self.ifsc!r}, account=****{self.account_number[-4:]})"


@dataclass(frozen=True)
class ProductConfig:
    id: str
    account_id: str
    activation_status: str
    requirements: list[dict[str, Any]] = field(default_factory=list)


@dataclass(frozen=True)
class CheckoutConfig:
    """Options handed to Razorpay Checkout in the browser."""

    key_id: str
    order_id: str
    amount_paise: int
    upi_allowed: bool
    options: dict[str, Any]


class PaymentsGateway(Protocol):
    @property
    def kind(self) -> Literal["fake", "razorpay"]: ...

    async def create_order(
        self, *, amount_paise: int, receipt: str, transfers: list[TransferRequest], notes: dict[str, str]
    ) -> Order: ...

    async def fetch_order(self, order_id: str) -> Order: ...

    async def fetch_payment(self, payment_id: str) -> Payment: ...

    async def fetch_payment_transfers(self, payment_id: str) -> list[Transfer]: ...

    async def fetch_transfer(self, transfer_id: str) -> Transfer: ...

    async def set_transfer_hold(self, transfer_id: str, *, on_hold: bool, until: datetime | None) -> Transfer: ...

    async def reverse_transfer(self, transfer_id: str, *, amount_paise: int, idempotency_key: str) -> Reversal: ...

    async def refund_payment(
        self, payment_id: str, *, amount_paise: int, idempotency_key: str, notes: dict[str, str]
    ) -> Refund: ...

    async def fetch_refund(self, payment_id: str, refund_id: str) -> Refund: ...

    async def create_linked_account(self, profile: LinkedAccountProfile) -> str: ...

    async def create_stakeholder(self, account_id: str, *, name: str, email: str, pan: str) -> str: ...

    async def request_route_product(self, account_id: str) -> ProductConfig: ...

    async def update_route_settlement(
        self, account_id: str, product_id: str, details: SettlementDetails
    ) -> ProductConfig: ...

    async def fetch_route_product(self, account_id: str, product_id: str) -> ProductConfig: ...

    def verify_webhook_signature(self, body: bytes, signature: str) -> bool: ...

    def verify_checkout_signature(self, *, order_id: str, payment_id: str, signature: str) -> bool: ...

    def checkout_config(
        self, *, order: Order, upi_limit_paise: int, prefill: dict[str, str], description: str
    ) -> CheckoutConfig: ...
