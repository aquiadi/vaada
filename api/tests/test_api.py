from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx

from tests.factory import draft_for, fake, Part, make_user
from vaada.auth import mint_persona_token
from vaada.context import AppContext
from vaada.main import create_app
from vaada.models import User


@asynccontextmanager
async def api(ctx: AppContext) -> AsyncIterator[httpx.AsyncClient]:
    app = create_app(ctx)
    async with app.router.lifespan_context(app):
        transport = httpx.ASGITransport(app=app, client=("10.1.2.3", 1234))
        async with httpx.AsyncClient(transport=transport, base_url="http://api.test") as client:
            yield client


def auth(ctx: AppContext, user: User) -> dict[str, str]:
    token = mint_persona_token(
        ctx.settings.persona_token_secret, user_id=user.id, email=user.email or "", name=user.display_name or "",
        now=datetime.now(UTC),
    )
    return {"Authorization": f"Bearer {token}"}


async def deliver_webhooks(ctx: AppContext, client: httpx.AsyncClient) -> list[dict[str, Any]]:
    from vaada.money import webhooks

    results = []
    for d in await fake(ctx).due_deliveries():
        response = await client.post(
            "/webhooks/razorpay",
            content=d.body,
            headers={"X-Razorpay-Signature": d.signature, "X-Razorpay-Event-Id": d.event_id, "Content-Type": "application/json"},
        )
        assert response.status_code == 200, response.text
        results.append(response.json())
        await fake(ctx).mark_delivered(d.seq)
    await webhooks.process_pending(ctx)
    return results


PAYOUT_FORM = {
    "legal_name": "Aditi Rao",
    "business_type": "individual",
    "pan": "ABCPR1234F",
    "account_number": "50100123454417",
    "ifsc": "HDFC0001234",
    "street1": "14 Saket Nagar",
    "street2": "",
    "city": "Indore",
    "state": "Madhya Pradesh",
    "postal_code": "452018",
    "phone": "+919876543210",
}


async def test_config_tells_the_web_app_what_it_needs(ctx: AppContext) -> None:
    async with api(ctx) as client:
        body = (await client.get("/config")).json()
    assert body["env"] == "dev" and body["gateway"] == "fake" and body["persona_switcher"]
    assert body["today"] == "2026-10-09"
    assert body["limits"]["max_deal_days"] == 120


async def test_the_whole_flow_over_http(ctx: AppContext) -> None:
    aditi = await make_user(ctx, "Aditi Rao")
    rahul = await make_user(ctx, "Rahul Mehta")
    async with api(ctx) as client:
        maker, buyer = auth(ctx, aditi), auth(ctx, rahul)

        room = (await client.post("/deals", headers=maker)).json()
        draft = draft_for(ctx, [Part(1_250_000, 10, "Advance"), Part(1_250_000, 20, "On delivery")]).model_dump(mode="json")
        saved = await client.patch(f"/deals/{room['id']}", json={"draft": draft, "version": room["draft_version"]}, headers=maker)
        assert saved.status_code == 200, saved.text

        refused = await client.post(f"/deals/{room['id']}/publish", json={"client_email": rahul.email}, headers=maker)
        assert refused.status_code == 409 and refused.json()["error"] == "payouts_not_ready"

        bad = await client.post("/payouts", json={**PAYOUT_FORM, "pan": "NOTAPAN"}, headers=maker)
        assert bad.status_code == 422 and bad.json()["field"] == "pan"
        setup = await client.post("/payouts", json=PAYOUT_FORM, headers=maker)
        assert setup.status_code == 200, setup.text
        assert setup.json()["payout"]["status"] == "under_review"
        assert setup.json()["payout"]["bank_last4"] == "4417"
        assert "account_number" not in setup.text and "ABCPR1234F" not in setup.text
        ctx.clock.advance(timedelta(seconds=6))  # type: ignore[attr-defined]
        status = (await client.get("/payouts", headers=maker)).json()
        assert status["payout"]["status"] == "activated"

        published = await client.post(f"/deals/{room['id']}/publish", json={"client_email": rahul.email}, headers=maker)
        assert published.status_code == 200, published.text
        slug = published.json()["slug"]

        public = (await client.get(f"/public/deeds/{slug}")).json()
        assert public["fees"] == {"total_paise": 2_500_000, "client_fee_paise": 60_500, "order_paise": 2_560_500, "upi_allowed": True}
        assert public["viewer_role"] is None and public["deal_id"] is None

        unsigned = await client.post(f"/public/deeds/{slug}/accept", json={"full_name": "Rahul Mehta", "agree": True})
        assert unsigned.status_code == 401
        accepted = await client.post(f"/public/deeds/{slug}/accept", json={"full_name": "Rahul Mehta", "agree": True}, headers=buyer)
        assert accepted.status_code == 200, accepted.text
        assert accepted.json()["accepted"]["email_masked"].startswith("r***@")

        order = (await client.post(f"/public/deeds/{slug}/order", headers=buyer)).json()
        assert order["gateway"] == "fake" and order["amount_paise"] == 2_560_500
        paid = (await client.post(f"/dev/fake-checkout/{order['order_id']}", json={"method": "upi"})).json()
        returned = await client.post(f"/public/deeds/{slug}/checkout-return", json=paid, headers=buyer)
        assert returned.status_code == 202

        results = await deliver_webhooks(ctx, client)
        assert results and not any(r["duplicate"] for r in results)
        room = (await client.get(f"/deals/{room['id']}", headers=maker)).json()
        assert room["status"] == "funded"
        first = room["milestones"][0]
        deliver_action = next(a for a in first["actions"] if a["action"] == "deliver")
        assert "bank account ending 4417" in deliver_action["effect"]

        delivered = (await client.post(f"/milestones/{first['id']}/deliver", json={"note": "Files in Drive"}, headers=maker)).json()
        assert delivered["milestones"][0]["status"] == "delivered"
        client_room = (await client.get(f"/deals/{room['id']}", headers=buyer)).json()
        approve = next(a for a in client_room["milestones"][0]["actions"] if a["action"] == "approve")
        assert approve["effect"] == "This releases ₹12,500 to Aditi's bank account ending 4417 on the next settlement. It can't be undone."
        released = (await client.post(f"/milestones/{first['id']}/approve", headers=buyer)).json()
        assert released["milestones"][0]["status"] == "released"
        assert any("released" in e["summary"] for e in released["events"])

        ledger = (await client.get("/ledger", headers=maker)).json()
        assert ledger["balances"] == {"held_paise": 1_250_000, "received_paise": 1_250_000}
        csv_text = (await client.get("/ledger.csv", headers=maker)).text
        assert "12500.00" in csv_text and "Released for settlement" in csv_text

        stranger = auth(ctx, await make_user(ctx, "Someone Else"))
        assert (await client.get(f"/deals/{room['id']}", headers=stranger)).status_code == 404
        assert (await client.get("/admin/queue", headers=maker)).status_code == 404


async def test_publish_problems_come_back_per_blank(ctx: AppContext) -> None:
    from tests.factory import give_payouts

    aditi = await make_user(ctx, "Aditi Rao")
    await give_payouts(ctx, aditi)
    async with api(ctx) as client:
        headers = auth(ctx, aditi)
        room = (await client.post("/deals", headers=headers)).json()
        response = await client.post(f"/deals/{room['id']}/publish", json={"client_email": "rahul@example.com"}, headers=headers)
    assert response.status_code == 422
    body = response.json()
    assert body["error"] == "terms"
    assert {"client_name", "work", "total", "plan"} <= {p["blank"] for p in body["problems"]}


async def test_webhook_endpoint_checks_signatures_and_dedupes(ctx: AppContext) -> None:
    async with api(ctx) as client:
        forged = await client.post("/webhooks/razorpay", content=b'{"event":"payment.captured"}', headers={"X-Razorpay-Signature": "00"})
        assert forged.status_code == 400
        body = b'{"event":"settlement.processed","payload":{}}'
        signature = fake(ctx)._sign(ctx.settings.fake_gateway_webhook_secret, body)
        headers = {"X-Razorpay-Signature": signature, "X-Razorpay-Event-Id": "evt_once"}
        first = (await client.post("/webhooks/razorpay", content=body, headers=headers)).json()
        second = (await client.post("/webhooks/razorpay", content=body, headers=headers)).json()
    assert first == {"accepted": True, "duplicate": False}
    assert second == {"accepted": True, "duplicate": True}


async def test_admin_queue_is_for_admins(ctx: AppContext) -> None:
    desk = await make_user(ctx, "Aj Admin", "aj@vaada.test")
    async with api(ctx) as client:
        response = await client.get("/admin/queue", headers=auth(ctx, desk))
    assert response.status_code == 200
    assert set(response.json()) >= {"disputes", "flags", "stuck_refunds", "registry_failures", "payout_accounts", "refund_deadlines"}


async def test_drafts_are_not_public(ctx: AppContext) -> None:
    aditi = await make_user(ctx, "Aditi Rao")
    async with api(ctx) as client:
        room = (await client.post("/deals", headers=auth(ctx, aditi))).json()
        response = await client.get(f"/public/deeds/{room['slug']}")
    assert response.status_code == 404


async def test_export_and_delete(ctx: AppContext) -> None:
    from tests.factory import funded

    scene = await funded(ctx)
    async with api(ctx) as client:
        headers = auth(ctx, scene.maker)
        export = await client.get("/me/export", headers=headers)
        assert export.status_code == 200 and "maker_id" in export.text
        refused = await client.delete("/me", headers=headers)
        assert refused.status_code == 409
        lone = await make_user(ctx, "Lone Maker")
        lone_headers = auth(ctx, lone)
        assert (await client.delete("/me", headers=lone_headers)).status_code == 204
        assert (await client.get("/me", headers=lone_headers)).status_code == 403


async def test_voice_update_note_and_revision(ctx: AppContext) -> None:
    from tests.factory import funded

    scene = await funded(ctx, revisions=1)
    async with api(ctx) as client:
        headers = auth(ctx, scene.maker)
        recorded = await client.post(
            f"/deals/{scene.deal.id}/voice-updates",
            json={
                "raw_text": "Rahul ne bola colors thode warm karo, aur font bhi badlo",
                "proposed_actions": [
                    {"type": "log_revision", "milestone_idx": 1, "note": "colors thode warm karo"},
                    {"type": "log_revision", "milestone_idx": 1, "note": "font bhi badlo"},
                    {"type": "note", "text": "Call on Thursday"},
                ],
            },
            headers=headers,
        )
        assert recorded.status_code == 201
        applied = await client.post(f"/voice-updates/{recorded.json()['id']}/apply", json={"indexes": [0, 1, 2]}, headers=headers)
        results = applied.json()["results"]
    assert results[1].endswith("The deed covers 1.")
    assert results[2] == "Noted in the register."
