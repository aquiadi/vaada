import random

import pytest

from tests.conftest import make_settings
from vaada.config import BootGuardError, check_boot_guards
from vaada.money.fees import (
    FeeMisconfiguredError,
    allocate,
    assert_transfers_fit,
    ceil_bps,
    check_fee_configuration,
    deal_money,
    worst_case_gateway_cost,
)

DEFAULTS = {"client_fee_bps": 242, "platform_fee_bps": 0, "tds_bps": 0}


def test_client_fee_rounds_up_to_the_paisa() -> None:
    assert ceil_bps(2_500_000, 242) == 60_500
    assert ceil_bps(1, 242) == 1
    assert ceil_bps(123_457, 242) == 2_988
    assert ceil_bps(0, 242) == 0


def test_order_amount_is_total_plus_processing_fee() -> None:
    money = deal_money([1_250_000, 1_250_000], **DEFAULTS)
    assert money.total_paise == 2_500_000
    assert money.client_fee_paise == 60_500
    assert money.order_paise == 2_560_500
    assert money.transfers_paise == 2_500_000


def test_allocate_puts_the_remainder_on_the_last_share() -> None:
    assert allocate(100, [1, 1, 1]) == [33, 33, 34]
    assert allocate(7, [5, 5]) == [3, 4]
    assert sum(allocate(99_999, [3, 7, 11, 13])) == 99_999


def test_platform_fee_and_tds_sum_exactly_across_milestones() -> None:
    rng = random.Random(42)
    for _ in range(500):
        parts = [rng.randint(100, 5_000_000) for _ in range(rng.randint(1, 6))]
        money = deal_money(parts, client_fee_bps=242, platform_fee_bps=rng.randint(0, 1000), tds_bps=rng.randint(0, 200))
        assert sum(m.amount_paise for m in money.milestones) == money.total_paise
        assert all(
            m.transfer_paise + m.platform_fee_paise + m.tds_paise == m.amount_paise for m in money.milestones
        )
        assert money.transfers_paise + money.platform_fee_paise + money.tds_paise == money.total_paise


def test_default_fees_fit_every_order_shape() -> None:
    rng = random.Random(7)
    for _ in range(2000):
        parts = [rng.randint(100, 2_000_000) for _ in range(rng.randint(1, 5))]
        money = deal_money(parts, **DEFAULTS)
        assert_transfers_fit(money, gateway_fee_bps=236, route_transfer_fee_bps=0)
        assert money.transfers_paise + worst_case_gateway_cost(money, gateway_fee_bps=236, route_transfer_fee_bps=0) <= money.order_paise


def test_a_236_bps_client_fee_cannot_cover_a_236_bps_fee_on_the_grossed_up_order() -> None:
    money = deal_money([2_500_000], client_fee_bps=236, platform_fee_bps=0, tds_bps=0)
    with pytest.raises(FeeMisconfiguredError):
        assert_transfers_fit(money, gateway_fee_bps=236, route_transfer_fee_bps=0)


def test_route_transfer_fees_count_against_the_fit() -> None:
    money = deal_money([1_250_000, 1_250_000], **DEFAULTS)
    with pytest.raises(FeeMisconfiguredError):
        assert_transfers_fit(money, gateway_fee_bps=236, route_transfer_fee_bps=25)


def test_boot_refuses_a_fee_setting_that_cannot_fit(db_url: str) -> None:
    assert check_fee_configuration(make_settings(db_url)) == []
    problems = check_fee_configuration(make_settings(db_url, client_fee_bps=236))
    assert problems and "fee settings fail" in problems[0]
    with pytest.raises(BootGuardError, match="fee settings fail"):
        check_boot_guards(make_settings(db_url, client_fee_bps=200))


def test_fees_leaving_nothing_to_transfer_are_refused() -> None:
    with pytest.raises(ValueError, match="nothing to transfer"):
        deal_money([100], client_fee_bps=242, platform_fee_bps=10_000, tds_bps=0)
