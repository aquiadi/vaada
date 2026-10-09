"""Logging that never carries PII, keys or payloads into production logs."""

import logging
import re
import sys
from typing import Any

import sentry_sdk

from vaada.config import Settings

SCRUBBERS = [
    (re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"), "[email]"),
    (re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b"), "[pan]"),
    (re.compile(r"\b\d{9,18}\b"), "[number]"),
    (re.compile(r"\+?91[\s-]?\d{10}\b"), "[phone]"),
    (re.compile(r"rzp_(live|test)_\w+"), "[razorpay-key]"),
    (re.compile(r"Bearer\s+[\w.-]+"), "Bearer [token]"),
]


def scrub(text: str) -> str:
    for pattern, replacement in SCRUBBERS:
        text = pattern.sub(replacement, text)
    return text


class ScrubFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.msg = scrub(record.getMessage())
        record.args = ()
        return True


def configure_logging(settings: Settings) -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    if not settings.is_sandbox:
        handler.addFilter(ScrubFilter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(settings.log_level.upper())
    for noisy in ("httpx", "web3", "urllib3", "asyncio"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def _before_send(event: Any, _hint: Any) -> Any:
    request = event.get("request") or {}
    for key in ("data", "cookies", "headers", "query_string"):
        request.pop(key, None)
    event.pop("user", None)
    for exception in (event.get("exception") or {}).get("values") or []:
        if isinstance(exception.get("value"), str):
            exception["value"] = scrub(exception["value"])
    if isinstance(event.get("message"), str):
        event["message"] = scrub(event["message"])
    return event


def configure_sentry(settings: Settings, component: str) -> None:
    if not settings.sentry_dsn:
        return
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.vaada_env.value,
        send_default_pii=False,
        max_request_body_size="never",
        traces_sample_rate=0.0,
        before_send=_before_send,
        server_name=component,
    )
