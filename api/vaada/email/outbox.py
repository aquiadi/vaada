import uuid
from functools import lru_cache
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape
from sqlalchemy.ext.asyncio import AsyncSession

from vaada.email.messages import Message
from vaada.models import OutboundEmail


@lru_cache
def _environment() -> Environment:
    return Environment(
        loader=FileSystemLoader(Path(__file__).parent / "templates"),
        autoescape=select_autoescape(["html"]),
        keep_trailing_newline=True,
    )


def render_html(message: Message) -> str:
    return _environment().get_template("base.html").render(message=message)


def queue_email(
    session: AsyncSession, *, to: str | None, template: str, message: Message, deal_id: uuid.UUID | None = None
) -> None:
    """Writes the email in the same transaction as the change it describes; a worker sends it."""
    if not to:
        return
    session.add(
        OutboundEmail(
            deal_id=deal_id,
            to_email=to,
            template=template,
            subject=message.subject,
            html=render_html(message),
            text_body=message.as_text(),
        )
    )
