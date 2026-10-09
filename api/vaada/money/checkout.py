from typing import Any

from vaada.money.gateway import CheckoutConfig, Order

BAHI_RED = "#8B1E1E"
CARD_NETWORKS = ["Visa", "MasterCard", "RuPay"]


def checkout_config(
    *, key_id: str, order: Order, upi_limit_paise: int, prefill: dict[str, str], description: str
) -> CheckoutConfig:
    """Only methods whose fee fits under the client processing fee: UPI, netbanking and domestic cards.
    No EMI, wallets, pay-later, international cards, Amex or Diners. Above the UPI limit, UPI is left out."""
    upi_allowed = order.amount_paise <= upi_limit_paise
    blocks: dict[str, Any] = {
        "netbanking": {"name": "Netbanking", "instruments": [{"method": "netbanking"}]},
        "cards": {
            "name": "Debit and credit cards issued in India",
            "instruments": [{"method": "card", "networks": CARD_NETWORKS, "types": ["debit", "credit"]}],
        },
    }
    sequence = ["block.netbanking", "block.cards"]
    if upi_allowed:
        blocks = {"upi": {"name": "UPI", "instruments": [{"method": "upi"}]}, **blocks}
        sequence = ["block.upi", *sequence]
    hidden = ["emi", "cardless_emi", "paylater", "wallet"] + ([] if upi_allowed else ["upi"])
    options: dict[str, Any] = {
        "key": key_id,
        "amount": order.amount_paise,
        "currency": "INR",
        "order_id": order.id,
        "name": "Vaada",
        "description": description,
        "prefill": prefill,
        "readonly": {"email": True},
        "theme": {"color": BAHI_RED},
        "method": {
            "upi": upi_allowed,
            "netbanking": True,
            "card": True,
            "wallet": False,
            "emi": False,
            "paylater": False,
            "cardless_emi": False,
        },
        "config": {
            "display": {
                "blocks": blocks,
                "sequence": sequence,
                "hide": [{"method": m} for m in hidden],
                "preferences": {"show_default_blocks": False},
            }
        },
    }
    return CheckoutConfig(
        key_id=key_id, order_id=order.id, amount_paise=order.amount_paise, upi_allowed=upi_allowed, options=options
    )
