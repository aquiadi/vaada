import json
import re
from datetime import timedelta

import pytest
from sqlalchemy import select

from tests.factory import Part, accepted, draft_for, give_payouts, make_user, milestone, published, reload
from vaada import deals
from vaada.agreement import canonical_json, keccak_hex
from vaada.context import AppContext
from vaada.models import Acceptance, OutboundEmail
from vaada.models.enums import DealStatus
from vaada.money.errors import MoneyError
from vaada.terms import Draft, TermsProblems


async def test_publishing_needs_an_activated_payout_account(ctx: AppContext) -> None:
    maker = await make_user(ctx, "Aditi Rao")
    deal = await deals.create_draft(ctx, maker, draft_for(ctx, [Part(2_500_000, 10)]))
    with pytest.raises(MoneyError) as raised:
        await deals.publish(ctx, deal.id, maker, "rahul@example.com")
    assert raised.value.code == "payouts_not_ready"


async def test_nothing_new_goes_out_while_new_deals_are_paused(ctx: AppContext) -> None:
    maker = await make_user(ctx, "Aditi Rao")
    await give_payouts(ctx, maker)
    deal = await deals.create_draft(ctx, maker, draft_for(ctx, [Part(2_500_000, 10)]))
    ctx.settings.new_deals_paused = True
    with pytest.raises(MoneyError) as raised:
        await deals.publish(ctx, deal.id, maker, "rahul@example.com")
    assert raised.value.code == "paused"
    assert (await reload(ctx, deal.id)).status == DealStatus.DRAFT
    ctx.settings.new_deals_paused = False
    await deals.publish(ctx, deal.id, maker, "rahul@example.com")


async def test_publish_freezes_terms_behind_a_hash_anyone_can_recompute(ctx: AppContext) -> None:
    scene = await published(ctx)
    deal = scene.deal
    assert deal.status == DealStatus.PUBLISHED
    assert deal.agreement_canonical and deal.agreement_hash
    document = json.loads(deal.agreement_canonical)
    assert keccak_hex(canonical_json(document)) == deal.agreement_hash
    assert document["money"] == {"total_paise": "2500000", "client_fee_paise": "60500", "platform_fee_paise": "0"}
    assert document["maker"]["maker_id"] == scene.maker.maker_id
    assert len(document["nonce"]) == 34
    assert [m["due_at"] for m in document["milestones"]] == ["2026-10-19T18:29:59Z", "2026-10-29T18:29:59Z"]
    assert milestone(deal, 1).due_at.isoformat() == "2026-10-19T18:29:59+00:00"


async def test_two_deeds_with_identical_terms_hash_differently(ctx: AppContext) -> None:
    a = await published(ctx)
    b = await published(ctx)
    assert a.deal.agreement_hash != b.deal.agreement_hash


async def test_publish_reports_each_problem_against_its_blank(ctx: AppContext) -> None:
    maker = await make_user(ctx, "Aditi Rao")
    await give_payouts(ctx, maker)
    draft = draft_for(ctx, [Part(1_250_000, 10), Part(1_250_000, 20)]).model_dump()
    draft["blanks"]["total"] = {"raw": "pachees hazaar", "value": 2_400_000, "confidence": "exact"}
    draft["blanks"]["client_name"] = {"raw": "", "value": None}
    draft["blanks"]["milestones.2.amount"] = {
        "raw": "kuch bhi",
        "value": None,
        "confidence": "failed",
        "note": "Couldn't read an amount here.",
    }
    draft["struck"] = ["ip_transfer", "kill_fee"]
    deal = await deals.create_draft(ctx, maker, Draft.model_validate(draft))
    with pytest.raises(TermsProblems) as raised:
        await deals.publish(ctx, deal.id, maker, "rahul@example.com")
    blanks = {p.blank: p.message for p in raised.value.problems}
    assert set(blanks) == {"client_name", "milestones.2.amount", "late_fee.days", "late_fee.amount"}
    assert blanks["milestones.2.amount"] == "Couldn't read an amount here."
    assert "strike the clause" in blanks["late_fee.days"]


async def test_milestones_must_add_up_to_the_total(ctx: AppContext) -> None:
    maker = await make_user(ctx, "Aditi Rao")
    await give_payouts(ctx, maker)
    draft = draft_for(ctx, [Part(1_250_000, 10), Part(1_250_000, 20)]).model_dump()
    draft["blanks"]["total"]["value"] = 2_400_000
    deal = await deals.create_draft(ctx, maker, Draft.model_validate(draft))
    with pytest.raises(TermsProblems, match=re.escape("The parts add up to ₹25,000, but the total is ₹24,000.")):
        await deals.publish(ctx, deal.id, maker, "rahul@example.com")


async def test_dates_must_be_inside_the_deal_length_cap(ctx: AppContext) -> None:
    maker = await make_user(ctx, "Aditi Rao")
    await give_payouts(ctx, maker)
    deal = await deals.create_draft(ctx, maker, draft_for(ctx, [Part(1_000_000, 10), Part(1_000_000, 121)]))
    with pytest.raises(TermsProblems) as raised:
        await deals.publish(ctx, deal.id, maker, "rahul@example.com")
    assert [p.blank for p in raised.value.problems] == ["milestones.2.due"]
    assert "at most 120 days" in raised.value.problems[0].message


async def test_publish_queues_the_email_to_the_client(ctx: AppContext) -> None:
    scene = await published(ctx)
    async with ctx.sessions() as session:
        email = (await session.execute(select(OutboundEmail))).scalar_one()
    assert email.to_email == scene.client.email
    assert email.template == "deed_sent"
    assert "₹25,605" in (email.text_body or "")
    assert "not refundable" in (email.html or "")
    assert f"/a/{scene.deal.slug}" in (email.html or "")


async def test_clickwrap_needs_a_name_and_the_tick(ctx: AppContext) -> None:
    scene = await published(ctx)
    with pytest.raises(MoneyError, match="Tick the box"):
        await deals.accept(
            ctx, scene.deal.id, scene.client, name_typed="Rahul Mehta", agreed=False, ip=None, user_agent=None
        )
    with pytest.raises(MoneyError, match="full name"):
        await deals.accept(ctx, scene.deal.id, scene.client, name_typed=" ", agreed=True, ip=None, user_agent=None)
    with pytest.raises(MoneyError, match="can't accept it as the client"):
        await deals.accept(
            ctx, scene.deal.id, scene.maker, name_typed="Aditi Rao", agreed=True, ip=None, user_agent=None
        )


async def test_acceptance_records_the_evidence_and_the_pay_by_date(ctx: AppContext) -> None:
    scene = await accepted(ctx)
    async with ctx.sessions() as session:
        acceptance = (await session.execute(select(Acceptance))).scalar_one()
    assert acceptance.agreement_hash == scene.deal.agreement_hash
    assert acceptance.name_typed == "Rahul Mehta"
    assert str(acceptance.ip) == "10.0.0.1"
    deal = await reload(ctx, scene.deal.id)
    assert deal.status == DealStatus.ACCEPTED
    assert deal.pay_by == ctx.clock.now() + timedelta(days=7)


async def test_pay_by_never_runs_past_the_first_due_date(ctx: AppContext) -> None:
    scene = await accepted(ctx, [Part(1_000_000, 3), Part(1_000_000, 20)])
    deal = await reload(ctx, scene.deal.id)
    assert deal.pay_by == milestone(deal, 1).due_at


async def test_a_deed_cannot_be_accepted_after_its_first_due_date(ctx: AppContext) -> None:
    scene = await published(ctx)
    ctx.clock.set(milestone(scene.deal, 1).due_at + timedelta(seconds=1))  # type: ignore[attr-defined]
    with pytest.raises(MoneyError, match="first date has passed"):
        await deals.accept(
            ctx, scene.deal.id, scene.client, name_typed="Rahul Mehta", agreed=True, ip=None, user_agent=None
        )
    assert await deals.lapse_overdue(ctx) == 1
    assert (await reload(ctx, scene.deal.id)).status == DealStatus.LAPSED


async def test_reissue_copies_the_words_and_clears_the_dates(ctx: AppContext) -> None:
    scene = await published(ctx)
    ctx.clock.set(milestone(scene.deal, 1).due_at + timedelta(days=1))  # type: ignore[attr-defined]
    await deals.lapse_overdue(ctx)
    fresh = await deals.reissue(ctx, scene.deal.id, scene.maker)
    assert fresh.status == DealStatus.DRAFT and fresh.reissued_from_id == scene.deal.id
    assert not any(k.endswith(".due") for k in fresh.draft["blanks"])
    assert fresh.draft["blanks"]["milestones.1.amount"]["value"] == 1_250_000


async def test_draft_autosave_rejects_a_stale_version(ctx: AppContext) -> None:
    maker = await make_user(ctx, "Aditi Rao")
    deal = await deals.create_draft(ctx, maker)
    assert deal.draft["blanks"]["maker_name"]["value"] == "Aditi Rao"
    updated = await deals.update_draft(ctx, deal.id, maker, Draft(), version=deal.draft_version)
    with pytest.raises(MoneyError) as raised:
        await deals.update_draft(ctx, deal.id, maker, Draft(), version=deal.draft_version)
    assert raised.value.code == "version_conflict"
    assert updated.draft_version == deal.draft_version + 1


async def test_opening_a_new_deed_reuses_one_never_written_in(ctx: AppContext) -> None:
    maker = await make_user(ctx, "Aditi Rao")
    first = await deals.blank_draft(ctx, maker)
    assert (await deals.blank_draft(ctx, maker)).id == first.id
    await deals.update_draft(ctx, first.id, maker, Draft.model_validate(first.draft), first.draft_version)
    second = await deals.blank_draft(ctx, maker)
    assert second.id != first.id
    filled = await deals.create_draft(ctx, maker, draft_for(ctx, [Part(2_500_000, 10)]))
    assert (await deals.blank_draft(ctx, maker)).id == second.id != filled.id


def test_too_many_revisions_reads_as_one_plain_problem(ctx: AppContext) -> None:
    from vaada.terms import REVISIONS_PROBLEM, terms_from_draft

    draft = draft_for(ctx, [Part(2_500_000, 10)]).model_dump()
    draft["blanks"]["revisions"]["value"] = 25
    with pytest.raises(TermsProblems) as raised:
        terms_from_draft(Draft.model_validate(draft))
    revisions = [p for p in raised.value.problems if p.blank == "revisions"]
    assert [p.message for p in revisions] == [REVISIONS_PROBLEM]


def test_a_draft_takes_only_known_blanks() -> None:
    from pydantic import ValidationError

    Draft.model_validate({"blanks": {"milestones.12.due": {"raw": "x"}}})
    with pytest.raises(ValidationError, match="unknown blanks"):
        Draft.model_validate({"blanks": {"anything.at.all": {"raw": "x"}}})
    with pytest.raises(ValidationError):
        Draft.model_validate({"blanks": {"work": {"raw": "x" * 2001}}})
