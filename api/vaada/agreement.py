"""The frozen agreement: canonical JSON of the terms, its keccak256 hash, and the refs we put on chain.

The browser recomputes the hash from the displayed terms (web/src/agreement/canonical.ts), so both
sides must produce byte-identical JSON: keys sorted, no whitespace, non-ASCII left as UTF-8, money as
integer strings, instants as ISO UTC with a trailing Z. shared/agreement-vectors.json pins this.
"""

import hashlib
import hmac
import json
import secrets
from datetime import UTC, date, datetime, time, timedelta
from typing import Any

from eth_hash.auto import keccak

AGREEMENT_VERSION = 1
IST_OFFSET = timedelta(hours=5, minutes=30)


def canonical_json(doc: Any) -> str:
    return json.dumps(doc, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def keccak_hex(text: str) -> str:
    return "0x" + keccak(text.encode("utf-8")).hex()


def new_nonce() -> str:
    return "0x" + secrets.token_hex(16)


def iso_utc(moment: datetime) -> str:
    if moment.tzinfo is None:
        raise ValueError("instants must be timezone-aware")
    return moment.astimezone(UTC).replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")


def end_of_day_ist(day: date) -> datetime:
    """A due date means the whole of that day in India: 23:59:59 IST."""
    local_end = datetime.combine(day, time(23, 59, 59))
    return (local_end - IST_OFFSET).replace(tzinfo=UTC)


def ist_date(moment: datetime) -> date:
    return (moment.astimezone(UTC) + IST_OFFSET).date()


def registry_ref(secret: str, razorpay_id: str) -> str:
    """HMAC of a Razorpay id: payment ids stay private on chain, but we can prove the link later."""
    return "0x" + hmac.new(secret.encode(), razorpay_id.encode(), hashlib.sha256).hexdigest()


ZERO_REF = "0x" + "00" * 32


def money(paise: int) -> str:
    if not isinstance(paise, int) or isinstance(paise, bool):
        raise TypeError("money must be integer paise")
    return str(paise)
