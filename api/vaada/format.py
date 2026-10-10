"""How money and time read in emails and register lines: Indian grouping, IST."""

from datetime import UTC, datetime, timedelta

IST = timedelta(hours=5, minutes=30)
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def indian_grouping(n: int) -> str:
    digits = str(n)
    if len(digits) <= 3:
        return digits
    head, tail = digits[:-3], digits[-3:]
    pairs: list[str] = []
    while len(head) > 2:
        pairs.insert(0, head[-2:])
        head = head[:-2]
    if head:
        pairs.insert(0, head)
    return ",".join([*pairs, tail])


def rupees(paise: int) -> str:
    """₹1,25,000 or ₹1,25,000.50"""
    sign = "−" if paise < 0 else ""
    whole, frac = divmod(abs(paise), 100)
    return f"{sign}₹{indian_grouping(whole)}" + (f".{frac:02d}" if frac else "")


def _ist(moment: datetime) -> datetime:
    return moment.astimezone(UTC) + IST


def ist_moment(moment: datetime) -> str:
    """12 Oct 2026, 14:03 IST"""
    local = _ist(moment)
    return f"{local.day} {MONTHS[local.month - 1]} {local.year}, {local:%H:%M} IST"


def ist_timestamp(moment: datetime) -> str:
    """2026-10-12 14:03, in IST: sorts as text and reads in a spreadsheet."""
    return f"{_ist(moment):%Y-%m-%d %H:%M}"


def ist_day(moment: datetime) -> str:
    """Sat 17 Oct 2026"""
    local = _ist(moment)
    return f"{WEEKDAYS[local.weekday()]} {local.day} {MONTHS[local.month - 1]} {local.year}"


def deed_number(deed_no: int) -> str:
    return f"{deed_no:04d}"


def mask_email(email: str) -> str:
    """r***@gmail.com"""
    local, _, domain = email.partition("@")
    return f"{local[:1]}***@{domain}" if domain else "***"


def roman(n: int) -> str:
    numerals = [(10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")]
    out = ""
    for value, numeral in numerals:
        while n >= value:
            out += numeral
            n -= value
    return out
