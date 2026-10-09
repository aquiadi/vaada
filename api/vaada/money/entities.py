"""Parses Razorpay's JSON entities into our value types. FakeGateway produces the same JSON shapes,
so both gateways read money state through these functions."""

from datetime import UTC, datetime
from typing import Any

from vaada.money.gateway import Order, Payment, ProductConfig, Refund, Reversal, Transfer


def from_unix(value: Any) -> datetime | None:
    if value in (None, 0, ""):
        return None
    return datetime.fromtimestamp(int(value), tz=UTC)


def to_unix(moment: datetime) -> int:
    return int(moment.timestamp())


def _notes(value: Any) -> dict[str, str]:
    # Razorpay returns an empty list rather than an empty object when there are no notes.
    if isinstance(value, dict):
        return {str(k): str(v) for k, v in value.items()}
    return {}


def order_from(data: dict[str, Any]) -> Order:
    return Order(
        id=data["id"], amount_paise=int(data["amount"]), status=data["status"], receipt=data.get("receipt") or ""
    )


def payment_from(data: dict[str, Any]) -> Payment:
    captured_at = from_unix(data.get("captured_at")) if data.get("captured") else None
    card = data.get("card") or {}
    return Payment(
        id=data["id"],
        order_id=data.get("order_id"),
        amount_paise=int(data["amount"]),
        status=data["status"],
        method=data.get("method"),
        fee_paise=int(data["fee"]) if data.get("fee") is not None else None,
        tax_paise=int(data["tax"]) if data.get("tax") is not None else None,
        captured_at=captured_at or (from_unix(data.get("created_at")) if data.get("status") == "captured" else None),
        international=bool(data.get("international")),
        card_network=card.get("network") if isinstance(card, dict) else None,
        error_reason=data.get("error_reason") or data.get("error_description"),
    )


def transfer_from(data: dict[str, Any]) -> Transfer:
    error = data.get("error") or {}
    return Transfer(
        id=data["id"],
        source=data.get("source"),
        account_id=data.get("recipient") or data.get("account") or "",
        amount_paise=int(data["amount"]),
        amount_reversed_paise=int(data.get("amount_reversed") or 0),
        on_hold=bool(data.get("on_hold")),
        on_hold_until=from_unix(data.get("on_hold_until")),
        status=data.get("status") or "created",
        settlement_status=data.get("settlement_status"),
        notes=_notes(data.get("notes")),
        error_reason=(error.get("reason") or error.get("description")) if isinstance(error, dict) else None,
    )


def reversal_from(data: dict[str, Any]) -> Reversal:
    return Reversal(
        id=data["id"],
        transfer_id=data["transfer_id"],
        amount_paise=int(data["amount"]),
        notes=_notes(data.get("notes")),
    )


def refund_from(data: dict[str, Any]) -> Refund:
    return Refund(
        id=data["id"],
        payment_id=data["payment_id"],
        amount_paise=int(data["amount"]),
        status=data.get("status") or "pending",
        notes=_notes(data.get("notes")),
    )


def product_from(data: dict[str, Any], account_id: str | None = None) -> ProductConfig:
    return ProductConfig(
        id=data["id"],
        account_id=data.get("account_id") or account_id or "",
        activation_status=data.get("activation_status") or "requested",
        requirements=list(data.get("requirements") or []),
    )
