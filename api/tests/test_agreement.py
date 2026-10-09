import json
from datetime import UTC, date, datetime
from pathlib import Path

import pytest

from vaada.agreement import canonical_json, end_of_day_ist, iso_utc, keccak_hex, money, registry_ref

VECTORS = Path(__file__).resolve().parents[2] / "shared" / "agreement-vectors.json"


def test_canonical_json_is_sorted_compact_and_utf8() -> None:
    doc = {"b": 1, "a": {"z": "वादा", "y": [3, "x\"y"]}, "c": None}
    assert canonical_json(doc) == '{"a":{"y":[3,"x\\"y"],"z":"वादा"},"b":1,"c":null}'


def test_money_must_be_integer_paise() -> None:
    assert money(2_500_000) == "2500000"
    with pytest.raises(TypeError):
        money(25000.0)  # type: ignore[arg-type]
    with pytest.raises(TypeError):
        money(True)


def test_due_dates_mean_the_end_of_that_day_in_india() -> None:
    assert iso_utc(end_of_day_ist(date(2026, 10, 17))) == "2026-10-17T18:29:59Z"


def test_iso_utc_requires_a_timezone() -> None:
    with pytest.raises(ValueError, match="timezone"):
        iso_utc(datetime(2026, 1, 1))  # noqa: DTZ001
    assert iso_utc(datetime(2026, 10, 9, 6, 30, 15, 999, tzinfo=UTC)) == "2026-10-09T06:30:15Z"


def test_refs_are_keyed_hmacs_not_the_payment_id() -> None:
    ref = registry_ref("s" * 40, "pay_ABC123")
    assert ref.startswith("0x") and len(ref) == 66
    assert ref != registry_ref("t" * 40, "pay_ABC123")
    assert "pay_ABC123" not in ref


def test_shared_vectors_match_the_browser() -> None:
    vectors = json.loads(VECTORS.read_text(encoding="utf-8"))
    assert len(vectors) >= 3
    for vector in vectors:
        canonical = canonical_json(vector["document"])
        assert canonical == vector["canonical"], vector["name"]
        assert keccak_hex(canonical) == vector["hash"], vector["name"]
