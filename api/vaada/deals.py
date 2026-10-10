"""Deeds before and around money: drafts, publishing (freezing the agreement), acceptance, lapsing,
re-issuing and agreed date changes."""

import secrets
import string
import uuid
from datetime import timedelta
from typing import Any

from sqlalchemy import select

from vaada import register
from vaada.agreement import canonical_json, end_of_day_ist, ist_date, keccak_hex, new_nonce
from vaada.context import AppContext
from vaada.db import transaction
from vaada.email import messages
from vaada.email.outbox import queue_email
from vaada.format import ist_day, ist_moment, mask_email, roman, rupees
from vaada.models import Acceptance, DateChange, Deal, Dictation, Milestone, Payment, User
from vaada.models.enums import (
    Confidence,
    DealStatus,
    MilestoneStatus,
    PaymentStatus,
    PayoutStatus,
    ProposalStatus,
    RegistryKind,
    Role,
)
from vaada.money.common import (
    deal_facts,
    load_deal,
    load_milestone,
    milestone_facts,
    party_emails,
    payout_account_of,
    refuse_if_paused,
    require_role,
)
from vaada.money.errors import MoneyError, NotFoundError
from vaada.money.fees import FeeMisconfiguredError, assert_transfers_fit, deal_money_for
from vaada.registry.queue import queue_record
from vaada.terms import Draft, Problem, TermsProblems, agreement_document, check_dates, terms_from_draft

SLUG_ALPHABET = "".join(c for c in string.ascii_lowercase + string.digits if c not in "ilo01")


def new_slug() -> str:
    """Short and unguessable: 12 characters from 31 gives about 59 bits."""
    return "".join(secrets.choice(SLUG_ALPHABET) for _ in range(12))


def policy(ctx: AppContext) -> dict[str, int]:
    s = ctx.settings
    return {
        "review_window_days": s.review_window_days,
        "hold_buffer_hours": s.hold_buffer_hours,
        "grace_days": s.grace_days,
        "accept_pay_days": s.accept_pay_days,
        "max_deal_days": s.max_deal_days,
        "client_fee_bps": s.client_fee_bps,
        "platform_fee_bps": s.platform_fee_bps,
    }


async def create_draft(ctx: AppContext, maker: User, draft: Draft | None = None) -> Deal:
    async with transaction(ctx.sessions) as session:
        blanks = (draft or Draft()).model_dump(mode="json")
        if maker.display_name and "maker_name" not in blanks["blanks"]:
            blanks["blanks"]["maker_name"] = {
                "raw": maker.display_name,
                "value": maker.display_name,
                "confidence": "exact",
                "note": None,
            }
        work = blanks["blanks"].get("work") or {}
        work_value = work.get("value")
        title = work_value if isinstance(work_value, str) else ""
        deal = Deal(slug=new_slug(), freelancer_id=maker.id, status=DealStatus.DRAFT, draft=blanks, title=title[:120])
        session.add(deal)
        await session.flush()
        await session.refresh(deal)
        return deal


async def blank_draft(ctx: AppContext, maker: User) -> Deal:
    """Opening a new deed hands back one the maker opened and never wrote in, rather than piling up empty drafts."""
    async with ctx.sessions() as session:
        never_saved = (
            await session.execute(
                select(Deal)
                .where(Deal.freelancer_id == maker.id, Deal.status == DealStatus.DRAFT, Deal.draft_version == 1)
                .order_by(Deal.created_at.desc())
                .limit(5)
            )
        ).scalars()
        # A re-issued deed is also never saved, but it starts filled in; only an empty one is spare.
        unused = next((d for d in never_saved if set((d.draft or {}).get("blanks", {})) <= {"maker_name"}), None)
    return unused or await create_draft(ctx, maker)


async def update_draft(ctx: AppContext, deal_id: uuid.UUID, maker: User, draft: Draft, version: int) -> Deal:
    async with transaction(ctx.sessions) as session:
        deal = await load_deal(session, deal_id, lock=True)
        require_role(deal, maker.id, Role.MAKER)
        if deal.status != DealStatus.DRAFT:
            raise MoneyError("Only a draft can be edited. Re-issue the deed to change it.")
        if version != deal.draft_version:
            raise MoneyError(
                "This draft changed in another window. Reload to see the latest version.", code="version_conflict"
            )
        deal.draft = draft.model_dump(mode="json")
        deal.draft_version += 1
        work = draft.blanks.get("work")
        if work and isinstance(work.value, str):
            deal.title = work.value[:120]
        return deal


async def delete_draft(ctx: AppContext, deal_id: uuid.UUID, maker: User) -> None:
    async with transaction(ctx.sessions) as session:
        deal = await load_deal(session, deal_id, lock=True)
        require_role(deal, maker.id, Role.MAKER)
        if deal.status != DealStatus.DRAFT:
            raise MoneyError("Only a draft can be deleted.")
        await session.delete(deal)


async def log_dictation(
    ctx: AppContext,
    deal_id: uuid.UUID,
    user: User,
    *,
    field: str,
    kind: str,
    raw: str,
    value: Any,
    confidence: Confidence,
) -> Dictation:
    async with transaction(ctx.sessions) as session:
        deal = await load_deal(session, deal_id)
        require_role(deal, user.id, Role.MAKER, Role.CLIENT)
        dictation = Dictation(
            deal_id=deal.id,
            user_id=user.id,
            field=field[:64],
            kind=kind[:16],
            raw_text=raw[:2000],
            normalized_value=value,
            confidence=confidence,
        )
        session.add(dictation)
        await session.flush()
        return dictation


async def mark_corrected(ctx: AppContext, dictation_id: uuid.UUID, user: User, corrected_value: Any) -> None:
    async with transaction(ctx.sessions) as session:
        dictation = await session.get(Dictation, dictation_id, with_for_update=True)
        if dictation is None or dictation.user_id != user.id:
            raise NotFoundError("That dictation")
        dictation.corrected = True
        dictation.corrected_value = corrected_value


async def publish(ctx: AppContext, deal_id: uuid.UUID, maker: User, client_email: str) -> Deal:
    client_email = client_email.strip().lower()
    async with transaction(ctx.sessions) as session:
        deal = await load_deal(session, deal_id, lock=True)
        require_role(deal, maker.id, Role.MAKER)
        if deal.status != DealStatus.DRAFT:
            raise MoneyError("This deed has already been sent.")
        refuse_if_paused(ctx.settings)
        if maker.email and client_email == maker.email.lower():
            raise MoneyError("That's your own email. Send the deed to your client.", status_code=422)
        payout = await payout_account_of(session, maker.id)
        if payout is None or payout.status != PayoutStatus.ACTIVATED:
            raise MoneyError(
                "Set up payouts first. A deed can only be sent once Razorpay has activated your payout account.",
                code="payouts_not_ready",
            )
        if not maker.maker_id:
            raise MoneyError("Your account is missing its maker id. Write to us.", status_code=500)

        draft = Draft.model_validate(deal.draft)
        terms = terms_from_draft(draft)
        now = ctx.clock.now()
        problems: list[Problem] = check_dates(terms, today=ist_date(now), max_days=ctx.settings.max_deal_days)
        if terms.total_paise < ctx.settings.min_deal_paise:
            problems.append(
                Problem(
                    blank="total", message=f"The smallest deed Vaada can hold is {rupees(ctx.settings.min_deal_paise)}."
                )
            )
        if problems:
            raise TermsProblems(problems)

        money = deal_money_for([m.amount_paise for m in terms.milestones], ctx.settings)
        try:
            assert_transfers_fit(
                money,
                gateway_fee_bps=ctx.settings.gateway_fee_bps,
                route_transfer_fee_bps=ctx.settings.route_transfer_fee_bps,
            )
        except FeeMisconfiguredError as exc:
            raise MoneyError(
                "We can't send deeds right now because of a problem with our fee settings. We've been told.",
                status_code=503,
            ) from exc

        nonce = new_nonce()
        document = agreement_document(
            deed_no=deal.deed_no,
            nonce=nonce,
            published_at=now,
            maker_id=maker.maker_id,
            terms=terms,
            deal_money=money,
            policy=policy(ctx),
        )
        canonical = canonical_json(document)
        deal.terms = terms.model_dump(mode="json")
        deal.struck_clauses = draft.struck
        deal.agreement_nonce = nonce
        deal.agreement_canonical = canonical
        deal.agreement_hash = keccak_hex(canonical)
        deal.total_paise = money.total_paise
        deal.client_fee_paise = money.client_fee_paise
        deal.platform_fee_paise = money.platform_fee_paise
        deal.title = terms.work[:120]
        deal.client_email = client_email
        deal.status = DealStatus.PUBLISHED
        deal.published_at = now
        for i, (mt, mm) in enumerate(zip(terms.milestones, money.milestones, strict=True), start=1):
            session.add(
                Milestone(
                    deal_id=deal.id,
                    idx=i,
                    title=mt.title,
                    deliverables=mt.deliverables,
                    amount_paise=mm.amount_paise,
                    platform_fee_paise=mm.platform_fee_paise,
                    tds_paise=mm.tds_paise,
                    transfer_paise=mm.transfer_paise,
                    due_at=end_of_day_ist(mt.due_date),
                    status=MilestoneStatus.UNFUNDED,
                )
            )
        await session.flush()
        await session.refresh(deal, ["milestones"])
        await register.log(
            session,
            deal_id=deal.id,
            kind="published",
            summary=f"Deed sent to {mask_email(client_email)}. Its terms are frozen; the agreement hash is "
            f"{deal.agreement_hash[:10]}…",
            role=Role.MAKER,
            actor_id=maker.id,
            at=now,
        )
        await queue_record(session, ctx.settings, deal=deal, maker_id=maker.maker_id, kind=RegistryKind.PUBLISHED)
        facts = await deal_facts(session, ctx.settings, deal)
        queue_email(
            session,
            to=client_email,
            template="deed_sent",
            deal_id=deal.id,
            message=messages.deed_sent(
                facts,
                total_paise=money.total_paise,
                client_fee_paise=money.client_fee_paise,
                first_due=min(m.due_at for m in deal.milestones),
            ),
        )
    await ctx.kick("send_emails")
    await ctx.kick("post_registry")
    return deal


async def resend(ctx: AppContext, deal_id: uuid.UUID, maker: User, client_email: str) -> None:
    """Corrects a typo in the client's address. The address is outside the frozen agreement on purpose."""
    async with transaction(ctx.sessions) as session:
        deal = await load_deal(session, deal_id, lock=True)
        require_role(deal, maker.id, Role.MAKER)
        if deal.status != DealStatus.PUBLISHED:
            raise MoneyError("Only a deed waiting for acceptance can be sent again.")
        deal.client_email = client_email.strip().lower()
        facts = await deal_facts(session, ctx.settings, deal)
        queue_email(
            session,
            to=deal.client_email,
            template="deed_sent",
            deal_id=deal.id,
            message=messages.deed_sent(
                facts,
                total_paise=deal.total_paise or 0,
                client_fee_paise=deal.client_fee_paise,
                first_due=min(m.due_at for m in deal.milestones),
            ),
        )
        await register.log(
            session,
            deal_id=deal.id,
            kind="resent",
            summary=f"Deed sent again to {mask_email(deal.client_email)}.",
            role=Role.MAKER,
            actor_id=maker.id,
            at=ctx.clock.now(),
        )
    await ctx.kick("send_emails")


def first_due(deal: Deal) -> Any:
    return min(m.due_at for m in deal.milestones)


async def accept(
    ctx: AppContext,
    deal_id: uuid.UUID,
    client: User,
    *,
    name_typed: str,
    agreed: bool,
    ip: str | None,
    user_agent: str | None,
) -> Acceptance:
    name_typed = " ".join(name_typed.split())
    if not agreed:
        raise MoneyError("Tick the box to say you've read the deed and agree to it.", status_code=422)
    if len(name_typed) < 2:
        raise MoneyError("Type your full name, the way you'd sign it.", status_code=422)
    if not client.email:
        raise MoneyError("Your account needs an email address to accept a deed.", status_code=422)
    async with transaction(ctx.sessions) as session:
        deal = await load_deal(session, deal_id, lock=True)
        now = ctx.clock.now()
        if deal.freelancer_id == client.id:
            raise MoneyError("You wrote this deed, so you can't accept it as the client.", status_code=403)
        if deal.status == DealStatus.ACCEPTED and deal.client_id == client.id:
            return (await session.execute(select(Acceptance).where(Acceptance.deal_id == deal.id))).scalar_one()
        if deal.status != DealStatus.PUBLISHED:
            raise MoneyError("This deed isn't open for acceptance.")
        if now > first_due(deal):
            raise MoneyError(
                "This deed's first date has passed, so it can't be accepted. "
                "Ask the Maker to re-issue it with new dates."
            )
        assert deal.agreement_hash is not None
        acceptance = Acceptance(
            deal_id=deal.id,
            user_id=client.id,
            name_typed=name_typed[:120],
            email=client.email,
            ip=ip,
            user_agent=(user_agent or "")[:400] or None,
            agreement_hash=deal.agreement_hash,
            accepted_at=now,
        )
        session.add(acceptance)
        deal.client_id = client.id
        deal.status = DealStatus.ACCEPTED
        deal.accepted_at = now
        deal.pay_by = min(now + timedelta(days=ctx.settings.accept_pay_days), first_due(deal))
        await register.log(
            session,
            deal_id=deal.id,
            kind="accepted",
            summary=f"Accepted by {name_typed} ({mask_email(client.email)}) on {ist_moment(now)}. "
            f"Payment is due by {ist_day(deal.pay_by)}.",
            role=Role.CLIENT,
            actor_id=client.id,
            at=now,
        )
        maker = await session.get(User, deal.freelancer_id)
        await queue_record(
            session, ctx.settings, deal=deal, maker_id=maker.maker_id if maker else None, kind=RegistryKind.ACCEPTED
        )
        facts = await deal_facts(session, ctx.settings, deal)
        queue_email(
            session,
            to=maker.email if maker else None,
            template="deed_accepted",
            deal_id=deal.id,
            message=messages.deed_accepted(facts, accepted_at=now, pay_by=deal.pay_by),
        )
    await ctx.kick("send_emails")
    await ctx.kick("post_registry")
    return acceptance


async def _lapse(ctx: AppContext, session: Any, deal: Deal, *, why: str) -> None:
    now = ctx.clock.now()
    deal.status = DealStatus.LAPSED
    deal.lapsed_at = now
    for m in deal.milestones:
        if m.status == MilestoneStatus.UNFUNDED:
            m.status = MilestoneStatus.CANCELLED
    await register.log(
        session, deal_id=deal.id, kind="lapsed", summary=f"The deed lapsed. {why}", role=Role.SYSTEM, at=now
    )
    facts = await deal_facts(session, ctx.settings, deal)
    maker_email, client_email = await party_emails(session, deal)
    message = messages.deal_lapsed(facts, why=why)
    for to in (maker_email, client_email if deal.client_id else None):
        queue_email(session, to=to, template="deal_lapsed", deal_id=deal.id, message=message)


async def lapse_overdue(ctx: AppContext) -> int:
    """Published deeds past their first due date, and accepted deeds not paid in time, lapse. A deed with
    a payment already in flight is left alone; the capture webhook decides it."""
    now = ctx.clock.now()
    lapsed = 0
    async with transaction(ctx.sessions) as session:
        candidates = (
            (
                await session.execute(
                    select(Deal)
                    .where(Deal.status.in_((DealStatus.PUBLISHED, DealStatus.ACCEPTED)))
                    .with_for_update(skip_locked=True)
                )
            )
            .scalars()
            .all()
        )
        for deal in candidates:
            if deal.status == DealStatus.PUBLISHED and now > first_due(deal):
                await _lapse(ctx, session, deal, why="Its first due date passed before it was accepted.")
                lapsed += 1
            elif deal.status == DealStatus.ACCEPTED and deal.pay_by is not None and now > deal.pay_by:
                in_flight = (
                    await session.execute(
                        select(Payment.id).where(
                            Payment.deal_id == deal.id,
                            Payment.status.in_((PaymentStatus.AUTHORIZED, PaymentStatus.CAPTURED)),
                        )
                    )
                ).first()
                if in_flight is None:
                    await _lapse(ctx, session, deal, why=f"It wasn't paid by {ist_day(deal.pay_by)}.")
                    lapsed += 1
    return lapsed


async def reissue(ctx: AppContext, deal_id: uuid.UUID, maker: User) -> Deal:
    """A new draft with the same words and amounts but every date cleared, for a deed that lapsed or was
    withdrawn. The old deed stays as it was."""
    async with ctx.sessions() as session:
        old = await load_deal(session, deal_id)
        require_role(old, maker.id, Role.MAKER)
        if old.status not in (DealStatus.LAPSED, DealStatus.CANCELLED, DealStatus.PUBLISHED):
            raise MoneyError("Only a lapsed or withdrawn deed can be re-issued.")
        draft = Draft.model_validate(old.draft)
    blanks = {k: v for k, v in draft.blanks.items() if not k.endswith(".due")}
    fresh = await create_draft(
        ctx, maker, Draft(blanks=blanks, struck=draft.struck, milestone_count=draft.milestone_count)
    )
    async with transaction(ctx.sessions) as session:
        stored = await load_deal(session, fresh.id, lock=True)
        stored.reissued_from_id = deal_id
        stored.title = old.title
        return stored


async def propose_date_change(
    ctx: AppContext, milestone_id: uuid.UUID, actor: User, *, new_due: Any, reason: str
) -> DateChange:
    async with transaction(ctx.sessions) as session:
        milestone = await load_milestone(session, milestone_id, lock=True)
        deal = await load_deal(session, milestone.deal_id)
        role = require_role(deal, actor.id, Role.MAKER, Role.CLIENT)
        if milestone.status not in (MilestoneStatus.HELD, MilestoneStatus.UNFUNDED) or deal.status in (
            DealStatus.CANCELLED,
            DealStatus.LAPSED,
            DealStatus.DRAFT,
        ):
            raise MoneyError("Only an undelivered milestone on a live deed can have its date moved.")
        now = ctx.clock.now()
        new_due_at = end_of_day_ist(new_due)
        if new_due_at <= now:
            raise MoneyError("The new date has to be in the future.", status_code=422)
        assert deal.published_at is not None
        if (new_due - ist_date(deal.published_at)).days > ctx.settings.max_deal_days:
            raise MoneyError(
                f"A deal on Vaada can run at most {ctx.settings.max_deal_days} days from when it was sent.",
                status_code=422,
            )
        change = DateChange(
            deal_id=deal.id,
            milestone_id=milestone.id,
            proposed_by=actor.id,
            proposed_role=role,
            old_due_at=milestone.due_at,
            new_due_at=new_due_at,
            reason=reason.strip(),
            created_at=now,
        )
        session.add(change)
        facts = await deal_facts(session, ctx.settings, deal)
        proposer = facts.maker if role == Role.MAKER else facts.client
        await register.log(
            session,
            deal_id=deal.id,
            milestone_id=milestone.id,
            kind="date_change_proposed",
            summary=f"{proposer} asked to move milestone {roman(milestone.idx)} from {ist_day(milestone.due_at)} "
            f"to {ist_day(new_due_at)}. It changes only if the other party agrees.",
            role=role,
            actor_id=actor.id,
            at=now,
        )
        maker_email, client_email = await party_emails(session, deal)
        queue_email(
            session,
            to=client_email if role == Role.MAKER else maker_email,
            template="date_change_proposed",
            deal_id=deal.id,
            message=messages.date_change_proposed(
                facts,
                milestone_facts(milestone),
                proposer=proposer,
                old=milestone.due_at,
                new=new_due_at,
                reason=reason,
            ),
        )
        await session.flush()
        return change


async def respond_date_change(ctx: AppContext, change_id: uuid.UUID, actor: User, *, agree: bool) -> None:
    async with transaction(ctx.sessions) as session:
        change = await session.get(DateChange, change_id, with_for_update=True)
        if change is None:
            raise NotFoundError("That date change")
        deal = await load_deal(session, change.deal_id)
        role = require_role(deal, actor.id, Role.MAKER, Role.CLIENT)
        if change.proposed_by == actor.id:
            raise MoneyError("The other party has to answer this one.")
        if change.status != ProposalStatus.PROPOSED:
            return
        now = ctx.clock.now()
        change.status = ProposalStatus.CONFIRMED if agree else ProposalStatus.DECLINED
        change.responded_at = now
        milestone = await load_milestone(session, change.milestone_id, lock=True)
        if agree:
            milestone.due_at = change.new_due_at
        facts = await deal_facts(session, ctx.settings, deal)
        responder = facts.maker if role == Role.MAKER else facts.client
        await register.log(
            session,
            deal_id=deal.id,
            milestone_id=milestone.id,
            kind="date_change_agreed" if agree else "date_change_declined",
            summary=(
                f"{responder} agreed: milestone {roman(milestone.idx)} is now due {ist_day(change.new_due_at)}. "
                "The original deed is unchanged; this amendment is recorded here."
                if agree
                else f"{responder} declined to move milestone {roman(milestone.idx)}. The date stays."
            ),
            role=role,
            actor_id=actor.id,
            at=now,
        )
        maker_email, client_email = await party_emails(session, deal)
        queue_email(
            session,
            to=maker_email if change.proposed_role == Role.MAKER else client_email,
            template="date_change_answered",
            deal_id=deal.id,
            message=messages.date_change_answered(
                facts, milestone_facts(milestone), responder=responder, agreed=agree, new=change.new_due_at
            ),
        )
