"""The only module that talks to Razorpay. Everything else goes through PaymentsGateway.

The official SDK is synchronous (requests), so each call runs in a worker thread. SDK retries stay off:
retrying a money call is our decision, made with idempotency keys, not the SDK's.
"""

import asyncio
import hashlib
import hmac
from collections.abc import Callable
from datetime import datetime
from typing import Any, Literal, TypeVar

import razorpay
import requests
from razorpay.errors import BadRequestError, ServerError
from razorpay.errors import GatewayError as RzpGatewayError

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
from vaada.money.gateway import (
    CheckoutConfig,
    GatewayRejectedError,
    GatewayUnavailableError,
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

T = TypeVar("T")

TIMEOUT_SECONDS = 20


class RazorpayGateway:
    kind: Literal["razorpay"] = "razorpay"

    def __init__(
        self,
        *,
        key_id: str,
        key_secret: str,
        webhook_secret: str,
        business_category: str = "services",
        business_subcategory: str = "consulting",
    ) -> None:
        self.key_id = key_id
        self._key_secret = key_secret
        self._webhook_secret = webhook_secret
        # From Razorpay's list for linked accounts; which pair fits freelancers is Razorpay's call (GO_LIVE.md).
        self._business_category = business_category
        self._business_subcategory = business_subcategory
        session = requests.Session()
        session.request = _with_timeout(session.request)  # type: ignore[method-assign]
        self._client = razorpay.Client(session=session, auth=(key_id, key_secret))
        self._client.set_app_details({"title": "Vaada", "version": "1"})

    async def _call(self, fn: Callable[..., T], *args: Any, **kwargs: Any) -> T:
        try:
            return await asyncio.to_thread(fn, *args, **kwargs)
        except BadRequestError as exc:
            message = str(exc)
            raise GatewayRejectedError(message, reason=_reason(message)) from exc
        except (ServerError, RzpGatewayError) as exc:
            raise GatewayUnavailableError(str(exc)) from exc
        except requests.RequestException as exc:
            raise GatewayUnavailableError(type(exc).__name__) from exc

    async def create_order(
        self, *, amount_paise: int, receipt: str, transfers: list[TransferRequest], notes: dict[str, str]
    ) -> Order:
        data = await self._call(
            self._client.order.create,
            {
                "amount": amount_paise,
                "currency": "INR",
                "receipt": receipt,
                "notes": notes,
                "transfers": [
                    {
                        "account": t.account_id,
                        "amount": t.amount_paise,
                        "currency": "INR",
                        "notes": t.notes,
                        "linked_account_notes": list(t.notes)[:2],
                        "on_hold": t.on_hold,
                    }
                    for t in transfers
                ],
            },
        )
        return order_from(data)

    async def fetch_order(self, order_id: str) -> Order:
        return order_from(await self._call(self._client.order.fetch, order_id))

    async def fetch_payment(self, payment_id: str) -> Payment:
        return payment_from(await self._call(self._client.payment.fetch, payment_id))

    async def fetch_payment_transfers(self, payment_id: str) -> list[Transfer]:
        data = await self._call(self._client.payment.transfers, payment_id)
        return [transfer_from(t) for t in data.get("items", [])]

    async def fetch_transfer(self, transfer_id: str) -> Transfer:
        return transfer_from(await self._call(self._client.transfer.fetch, transfer_id))

    async def set_transfer_hold(self, transfer_id: str, *, on_hold: bool, until: datetime | None) -> Transfer:
        body: dict[str, Any] = {"on_hold": on_hold}
        if on_hold and until is not None:
            body["on_hold_until"] = to_unix(until)
        return transfer_from(await self._call(self._client.transfer.edit, transfer_id, body))

    async def reverse_transfer(self, transfer_id: str, *, amount_paise: int, idempotency_key: str) -> Reversal:
        # Reversals have no idempotency header, so look for one we already made with this key first.
        existing = await self._call(self._client.transfer.reversals, transfer_id)
        for item in existing.get("items", []):
            notes = item.get("notes") or {}
            if isinstance(notes, dict) and notes.get("vaada_key") == idempotency_key:
                return reversal_from(item)
        data = await self._call(
            self._client.transfer.reverse,
            transfer_id,
            {"amount": amount_paise, "notes": {"vaada_key": idempotency_key}},
        )
        return reversal_from(data)

    async def refund_payment(
        self, payment_id: str, *, amount_paise: int, idempotency_key: str, notes: dict[str, str]
    ) -> Refund:
        data = await self._call(
            self._client.payment.refund,
            payment_id,
            {"amount": amount_paise, "speed": "normal", "notes": notes, "receipt": idempotency_key[:40]},
            headers={"X-Refund-Idempotency": idempotency_key},
        )
        return refund_from(data)

    async def fetch_refund(self, payment_id: str, refund_id: str) -> Refund:
        return refund_from(await self._call(self._client.payment.fetch_refund_id, payment_id, refund_id))

    async def create_linked_account(self, profile: LinkedAccountProfile) -> str:
        data = await self._call(
            self._client.account.create,
            {
                "email": profile.email,
                "phone": profile.phone,
                "type": "route",
                "reference_id": profile.reference_id,
                "legal_business_name": profile.legal_name,
                "business_type": profile.business_type,
                "contact_name": profile.legal_name,
                "profile": {
                    "category": self._business_category,
                    "subcategory": self._business_subcategory,
                    "addresses": {
                        "registered": {
                            "street1": profile.street1,
                            "street2": profile.street2 or profile.city,
                            "city": profile.city,
                            "state": profile.state.upper(),
                            "postal_code": profile.postal_code,
                            "country": "IN",
                        }
                    },
                },
                "legal_info": {"pan": profile.pan},
            },
        )
        return str(data["id"])

    async def create_stakeholder(self, account_id: str, *, name: str, email: str, pan: str) -> str:
        data = await self._call(
            self._client.stakeholder.create, account_id, {"name": name, "email": email, "kyc": {"pan": pan}}
        )
        return str(data["id"])

    async def request_route_product(self, account_id: str) -> ProductConfig:
        data = await self._call(
            self._client.product.requestProductConfiguration,
            account_id,
            {"product_name": "route", "tnc_accepted": True},
        )
        return product_from(data, account_id)

    async def update_route_settlement(
        self, account_id: str, product_id: str, details: SettlementDetails
    ) -> ProductConfig:
        data = await self._call(
            self._client.product.edit,
            account_id,
            product_id,
            {
                "settlements": {
                    "account_number": details.account_number,
                    "ifsc_code": details.ifsc,
                    "beneficiary_name": details.beneficiary_name,
                },
                "tnc_accepted": True,
            },
        )
        return product_from(data, account_id)

    async def fetch_route_product(self, account_id: str, product_id: str) -> ProductConfig:
        return product_from(await self._call(self._client.product.fetch, account_id, product_id), account_id)

    def verify_webhook_signature(self, body: bytes, signature: str) -> bool:
        expected = hmac.new(self._webhook_secret.encode(), body, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, signature)

    def verify_checkout_signature(self, *, order_id: str, payment_id: str, signature: str) -> bool:
        expected = hmac.new(self._key_secret.encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, signature)

    def checkout_config(
        self, *, order: Order, upi_limit_paise: int, prefill: dict[str, str], description: str
    ) -> CheckoutConfig:
        return checkout_config(
            key_id=self.key_id, order=order, upi_limit_paise=upi_limit_paise, prefill=prefill, description=description
        )


def _with_timeout(request: Callable[..., Any]) -> Callable[..., Any]:
    def wrapped(method: str, url: str, **kwargs: Any) -> Any:
        kwargs.setdefault("timeout", TIMEOUT_SECONDS)
        return request(method, url, **kwargs)

    return wrapped


def _reason(message: str) -> str | None:
    lowered = message.lower()
    if "pan" in lowered:
        return "invalid_pan"
    if "ifsc" in lowered:
        return "invalid_ifsc"
    if "account number" in lowered:
        return "invalid_account_number"
    if "balance" in lowered:
        return "insufficient_balance"
    return None
