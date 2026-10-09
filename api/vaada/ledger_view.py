"""The freelancer's books: amanat (held in trust) and jama (received), entry by entry, with running totals."""

import csv
import io
from typing import Any, Literal

from sqlalchemy import select

from vaada.context import AppContext
from vaada.format import deed_number
from vaada.models import Deal, LedgerEntry, Milestone, User
from vaada.models.enums import DealStatus, LedgerKind

Filter = Literal["all", "open", "held", "released"]
CLOSED = (DealStatus.COMPLETED, DealStatus.CANCELLED, DealStatus.LAPSED)

PARTICULARS = {
    LedgerKind.HELD: "Held by Razorpay",
    LedgerKind.HOLD_EXTENDED: "Delivered; release date set",
    LedgerKind.RELEASED: "Released for settlement",
    LedgerKind.REVERSED: "Returned to the client",
    LedgerKind.TRANSFER_FAILED: "Transfer failed; Vaada is on it",
}


async def entries(ctx: AppContext, maker: User, which: Filter) -> list[dict[str, Any]]:
    async with ctx.sessions() as session:
        rows = (
            await session.execute(
                select(LedgerEntry, Deal, Milestone)
                .join(Deal, Deal.id == LedgerEntry.deal_id)
                .outerjoin(Milestone, Milestone.id == LedgerEntry.milestone_id)
                .where(Deal.freelancer_id == maker.id, LedgerEntry.kind.in_(list(PARTICULARS)))
                .order_by(LedgerEntry.created_at, LedgerEntry.id)
            )
        ).all()
    out: list[dict[str, Any]] = []
    held_balance = 0
    received = 0
    for entry, deal, milestone in rows:
        held = 0
        jama = 0
        if entry.kind == LedgerKind.HELD:
            held = entry.amount_paise
        elif entry.kind == LedgerKind.RELEASED:
            held = -entry.amount_paise
            jama = entry.amount_paise
        elif entry.kind == LedgerKind.REVERSED:
            held = -entry.amount_paise
        held_balance += held
        received += jama
        include = (
            which == "all"
            or (which == "open" and deal.status not in CLOSED)
            or (which == "held" and entry.kind in (LedgerKind.HELD, LedgerKind.HOLD_EXTENDED))
            or (which == "released" and entry.kind == LedgerKind.RELEASED)
        )
        if not include:
            continue
        client = (deal.terms or {}).get("client_name") or "Client"
        out.append(
            {
                "at": entry.created_at.isoformat(),
                "deal_id": str(deal.id),
                "deed_no": deal.deed_no,
                "client": client,
                "milestone_idx": milestone.idx if milestone else None,
                "milestone_title": milestone.title if milestone else None,
                "kind": entry.kind.value,
                "particulars": PARTICULARS[entry.kind],
                "held_paise": held,
                "received_paise": jama,
                "held_balance_paise": held_balance,
                "received_total_paise": received,
                "razorpay_ref": entry.razorpay_object_id,
            }
        )
    return out


def totals(rows: list[dict[str, Any]]) -> dict[str, int]:
    return {
        "held_paise": sum(r["held_paise"] for r in rows),
        "received_paise": sum(r["received_paise"] for r in rows),
    }


def inr(paise: int) -> str:
    """25000.00 from 2500000, with integer arithmetic only."""
    if not paise:
        return ""
    sign = "-" if paise < 0 else ""
    whole, frac = divmod(abs(paise), 100)
    return f"{sign}{whole}.{frac:02d}"


def as_csv(rows: list[dict[str, Any]]) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "Date (UTC)",
            "Deed No.",
            "Client",
            "Milestone",
            "Particulars",
            "Held (INR)",
            "Received (INR)",
            "Razorpay reference",
        ]
    )
    for r in rows:
        writer.writerow(
            [
                r["at"][:19].replace("T", " "),
                deed_number(r["deed_no"]),
                r["client"],
                f"{r['milestone_idx']}. {r['milestone_title']}" if r["milestone_idx"] else "",
                r["particulars"],
                inr(r["held_paise"]),
                inr(r["received_paise"]),
                r["razorpay_ref"],
            ]
        )
    return buffer.getvalue()
