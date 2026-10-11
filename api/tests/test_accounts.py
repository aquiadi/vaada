import httpx
import pytest
import respx
from sqlalchemy import select

from tests.factory import accepted, make_user
from vaada import users
from vaada.context import AppContext
from vaada.models import OutboundEmail, User
from vaada.models.enums import EmailStatus
from vaada.money.errors import MoneyError


async def test_an_export_holds_your_own_data_not_the_other_partys(ctx: AppContext) -> None:
    scene = await accepted(ctx)
    made = await users.export_data(ctx, scene.maker)
    paid = await users.export_data(ctx, scene.client)
    assert made["acceptances"] == []
    assert [a["email"] for a in paid["acceptances"]] == [scene.client.email]
    assert "draft" in made["deeds"][0] and made["deeds"][0]["role"] == "maker"
    assert "draft" not in paid["deeds"][0] and paid["deeds"][0]["role"] == "client"
    assert paid["ledger"] == []


async def test_deleting_an_account_removes_the_letters_sent_to_it(ctx: AppContext) -> None:
    lone = await make_user(ctx, "Lone Maker")
    async with ctx.sessions() as session:
        session.add(OutboundEmail(to_email=lone.email or "", template="t", subject="Hello Lone", html="<p>Lone</p>"))
        await session.commit()
    await users.delete_account(ctx, lone)
    async with ctx.sessions() as session:
        left = (await session.execute(select(OutboundEmail).where(OutboundEmail.template == "t"))).scalar_one()
        stored = await session.get(User, lone.id)
    assert left.to_email == "removed" and left.html is None and left.subject == "Removed when the account was deleted"
    assert left.status == EmailStatus.FAILED
    assert stored is not None and stored.email is None and stored.deleted_at is not None


@respx.mock
async def test_deleting_an_account_removes_its_sign_in_record_first(ctx: AppContext) -> None:
    ctx.settings.supabase_service_role_key = "service-key"
    lone = await make_user(ctx, "Lone Maker")
    route = respx.delete(f"http://127.0.0.1:54321/auth/v1/admin/users/{lone.id}").mock(return_value=httpx.Response(500))
    with pytest.raises(MoneyError, match="nothing was deleted"):
        await users.delete_account(ctx, lone)
    async with ctx.sessions() as session:
        untouched = await session.get(User, lone.id)
    assert untouched is not None and untouched.email == lone.email

    route.mock(return_value=httpx.Response(200))
    await users.delete_account(ctx, lone)
    assert route.calls.last.request.headers["apikey"] == "service-key"
    async with ctx.sessions() as session:
        gone = await session.get(User, lone.id)
    assert gone is not None and gone.email is None
