"""Sends queued emails. In dev and demo they stay in the outbox page; otherwise Resend delivers them and
we drop the body once it's sent."""

import logging

import httpx
from sqlalchemy import select

from vaada.context import AppContext
from vaada.db import transaction
from vaada.models import OutboundEmail
from vaada.models.enums import EmailStatus

log = logging.getLogger(__name__)

RESEND_URL = "https://api.resend.com/emails"
MAX_ATTEMPTS = 5


async def send_queued(ctx: AppContext, *, limit: int = 50, client: httpx.AsyncClient | None = None) -> int:
    async with ctx.sessions() as session:
        ids = (
            (
                await session.execute(
                    select(OutboundEmail.id)
                    .where(OutboundEmail.status == EmailStatus.QUEUED, OutboundEmail.attempts < MAX_ATTEMPTS)
                    .order_by(OutboundEmail.created_at)
                    .limit(limit)
                )
            )
            .scalars()
            .all()
        )
    if not ids:
        return 0
    sent = 0
    own_client = client is None
    http = client or httpx.AsyncClient(timeout=15)
    try:
        for email_id in ids:
            async with transaction(ctx.sessions) as session:
                email = await session.get(OutboundEmail, email_id, with_for_update=True)
                if email is None or email.status != EmailStatus.QUEUED:
                    continue
                if ctx.settings.email_transport == "outbox":
                    email.status = EmailStatus.SENT
                    email.sent_at = ctx.clock.now()
                    sent += 1
                    continue
                try:
                    response = await http.post(
                        RESEND_URL,
                        headers={"Authorization": f"Bearer {ctx.settings.resend_api_key}"},
                        json={
                            "from": ctx.settings.email_from,
                            "to": [email.to_email],
                            "subject": email.subject,
                            "html": email.html,
                            "text": email.text_body,
                        },
                    )
                    response.raise_for_status()
                except httpx.HTTPError as exc:
                    email.attempts += 1
                    email.last_error = f"{type(exc).__name__}"
                    if email.attempts >= MAX_ATTEMPTS:
                        email.status = EmailStatus.FAILED
                    log.warning("email %s failed to send (attempt %s)", email.id, email.attempts)
                    continue
                email.status = EmailStatus.SENT
                email.sent_at = ctx.clock.now()
                email.provider_id = str(response.json().get("id", ""))
                email.html = None
                email.text_body = None
                sent += 1
    finally:
        if own_client:
            await http.aclose()
    return sent
