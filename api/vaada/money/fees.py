"""Fee and transfer arithmetic. Integer paise only; every sum is exact to the paisa."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from vaada.config import Settings


class FeeMisconfiguredError(RuntimeError):
    """Transfers plus the worst-case gateway fee would not fit inside the order amount."""


def ceil_bps(amount_paise: int, bps: int) -> int:
    return -(-amount_paise * bps // 10_000)


def floor_bps(amount_paise: int, bps: int) -> int:
    return amount_paise * bps // 10_000


def allocate(total: int, weights: list[int]) -> list[int]:
    """Shares of `total` proportional to `weights`, floored, with the remainder on the last share."""
    weight_sum = sum(weights)
    if weight_sum <= 0:
        raise ValueError("weights must sum to more than zero")
    shares = [total * w // weight_sum for w in weights]
    shares[-1] += total - sum(shares)
    return shares


@dataclass(frozen=True)
class MilestoneMoney:
    amount_paise: int
    platform_fee_paise: int
    tds_paise: int

    @property
    def transfer_paise(self) -> int:
        return self.amount_paise - self.platform_fee_paise - self.tds_paise


@dataclass(frozen=True)
class DealMoney:
    total_paise: int
    client_fee_paise: int
    milestones: tuple[MilestoneMoney, ...]

    @property
    def order_paise(self) -> int:
        return self.total_paise + self.client_fee_paise

    @property
    def platform_fee_paise(self) -> int:
        return sum(m.platform_fee_paise for m in self.milestones)

    @property
    def tds_paise(self) -> int:
        return sum(m.tds_paise for m in self.milestones)

    @property
    def transfers_paise(self) -> int:
        return sum(m.transfer_paise for m in self.milestones)


def deal_money(milestone_amounts: list[int], *, client_fee_bps: int, platform_fee_bps: int, tds_bps: int) -> DealMoney:
    if not milestone_amounts or any(a <= 0 for a in milestone_amounts):
        raise ValueError("every milestone needs a positive amount")
    total = sum(milestone_amounts)
    platform = allocate(floor_bps(total, platform_fee_bps), milestone_amounts) if platform_fee_bps else None
    tds = allocate(floor_bps(total, tds_bps), milestone_amounts) if tds_bps else None
    milestones = tuple(
        MilestoneMoney(
            amount_paise=amount,
            platform_fee_paise=platform[i] if platform else 0,
            tds_paise=tds[i] if tds else 0,
        )
        for i, amount in enumerate(milestone_amounts)
    )
    if any(m.transfer_paise <= 0 for m in milestones):
        raise ValueError("fees leave nothing to transfer for a milestone")
    return DealMoney(total_paise=total, client_fee_paise=ceil_bps(total, client_fee_bps), milestones=milestones)


def worst_case_gateway_cost(money: DealMoney, *, gateway_fee_bps: int, route_transfer_fee_bps: int) -> int:
    gateway = ceil_bps(money.order_paise, gateway_fee_bps)
    route = sum(ceil_bps(m.transfer_paise, route_transfer_fee_bps) for m in money.milestones)
    return gateway + route


def assert_transfers_fit(money: DealMoney, *, gateway_fee_bps: int, route_transfer_fee_bps: int) -> None:
    """Razorpay takes its fee out of the captured payment and fails a transfer that exceeds what is left.
    Refuse the order up front rather than let a transfer fail after the client has paid."""
    cost = worst_case_gateway_cost(
        money, gateway_fee_bps=gateway_fee_bps, route_transfer_fee_bps=route_transfer_fee_bps
    )
    if money.transfers_paise + cost > money.order_paise:
        raise FeeMisconfiguredError(
            f"transfers {money.transfers_paise} + worst-case gateway cost {cost} "
            f"exceed order amount {money.order_paise} (deal total {money.total_paise}, "
            f"client fee {money.client_fee_paise})"
        )


def deal_money_for(milestone_amounts: list[int], settings: Settings) -> DealMoney:
    return deal_money(
        milestone_amounts,
        client_fee_bps=settings.client_fee_bps,
        platform_fee_bps=settings.platform_fee_bps,
        tds_bps=settings.tds_bps,
    )


def check_fee_configuration(settings: Settings) -> list[str]:
    """Run the fit assertion over awkward totals and splits so a bad fee setting stops the boot."""
    samples = [settings.min_deal_paise, 123_457, 2_500_000, 10_000_001, 99_999_999]
    splits = [1, 2, 3, 5]
    problems: list[str] = []
    for total in samples:
        for parts in splits:
            amounts = [total // parts] * parts
            amounts[-1] += total - sum(amounts)
            try:
                money = deal_money_for(amounts, settings)
                assert_transfers_fit(
                    money,
                    gateway_fee_bps=settings.gateway_fee_bps,
                    route_transfer_fee_bps=settings.route_transfer_fee_bps,
                )
            except (FeeMisconfiguredError, ValueError) as exc:
                problems.append(f"fee settings fail for a {total} paise deal in {parts} parts: {exc}")
                return problems
    return problems
