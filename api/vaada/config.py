import os
from enum import StrEnum
from functools import lru_cache
from typing import Literal
from urllib.parse import urlsplit

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Env(StrEnum):
    DEV = "dev"
    DEMO = "demo"
    STAGING = "staging"
    PRODUCTION = "production"


SANDBOX_ENVS = frozenset({Env.DEV, Env.DEMO})
TRANSACTION_POOLER_PORT = 6543


class BootGuardError(RuntimeError):
    """The configuration would put real money or real people at risk; the process must not start."""


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=os.environ.get("VAADA_ENV_FILE"), extra="ignore")

    vaada_env: Env
    database_url: str
    redis_url: str = "redis://127.0.0.1:6379/0"
    web_origin: str = "http://localhost:5173"
    api_public_url: str = "http://localhost:8000"
    trust_proxy_headers: bool = False

    supabase_url: str
    supabase_anon_key: str = ""
    supabase_jwt_audience: str = "authenticated"
    google_signin_enabled: bool = False

    persona_switcher_enabled: bool = False
    persona_token_secret: str = ""
    dev_tools_enabled: bool = False

    payments_gateway: Literal["fake", "razorpay"] = "razorpay"
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    razorpay_webhook_secret: str = ""
    fake_gateway_key_id: str = "rzp_fake_dev"
    fake_gateway_key_secret: str = "fake-key-secret-for-dev-and-demo-only"
    fake_gateway_webhook_secret: str = "fake-webhook-secret-for-dev-and-demo-only"
    fake_gateway_activation_seconds: int = 5
    fake_gateway_chaos: str = ""

    client_fee_bps: int = 242
    gateway_fee_bps: int = 236
    route_transfer_fee_bps: int = 0
    platform_fee_bps: int = 0
    tds_bps: int = 0
    upi_limit_paise: int = 10_000_000
    min_deal_paise: int = 50_000
    max_deal_days: int = 120
    accept_pay_days: int = 7
    review_window_days: int = 5
    hold_buffer_hours: int = 24
    grace_days: int = 3
    refund_limit_days: int = 175
    refund_warning_days: int = 14

    chain_rpc_url: str = ""
    chain_id: int = 31337
    registry_address: str = ""
    recorder_private_key: str = ""
    chain_explorer_tx_url: str = ""
    ref_hmac_secret: str

    email_transport: Literal["outbox", "resend"] = "outbox"
    resend_api_key: str = ""
    email_from: str = "Vaada <deeds@vaada.local>"

    admin_emails: str = ""
    sentry_dsn: str = ""
    rate_limit_enabled: bool = True
    log_level: str = "INFO"

    @field_validator("admin_emails")
    @classmethod
    def _lower(cls, v: str) -> str:
        return v.lower()

    @property
    def admin_email_set(self) -> frozenset[str]:
        return frozenset(e.strip() for e in self.admin_emails.split(",") if e.strip())

    @property
    def is_sandbox(self) -> bool:
        return self.vaada_env in SANDBOX_ENVS

    @property
    def registry_enabled(self) -> bool:
        return bool(self.registry_address and self.chain_rpc_url and self.recorder_private_key)


def check_boot_guards(settings: Settings) -> None:
    from vaada.money.fees import check_fee_configuration

    problems: list[str] = []
    sandbox_only = {
        "PERSONA_SWITCHER_ENABLED": settings.persona_switcher_enabled,
        "DEV_TOOLS_ENABLED": settings.dev_tools_enabled,
        "PAYMENTS_GATEWAY=fake": settings.payments_gateway == "fake",
    }
    if not settings.is_sandbox:
        problems += [f"{name} is only allowed in dev and demo" for name, on in sandbox_only.items() if on]

    razorpay_keys = {
        "RAZORPAY_KEY_ID": settings.razorpay_key_id,
        "RAZORPAY_KEY_SECRET": settings.razorpay_key_secret,
        "RAZORPAY_WEBHOOK_SECRET": settings.razorpay_webhook_secret,
    }
    if settings.vaada_env == Env.DEMO:
        problems += [f"{name} must not be set in demo" for name, value in razorpay_keys.items() if value]

    if settings.payments_gateway == "razorpay":
        problems += [f"{name} is required with PAYMENTS_GATEWAY=razorpay" for name, v in razorpay_keys.items() if not v]
        expected_prefix = {Env.PRODUCTION: "rzp_live_", Env.STAGING: "rzp_test_"}.get(settings.vaada_env)
        if expected_prefix and settings.razorpay_key_id and not settings.razorpay_key_id.startswith(expected_prefix):
            problems.append(f"RAZORPAY_KEY_ID in {settings.vaada_env} must start with {expected_prefix}")

    if settings.persona_switcher_enabled and len(settings.persona_token_secret) < 32:
        problems.append("PERSONA_TOKEN_SECRET must be at least 32 characters")
    if len(settings.ref_hmac_secret) < 32:
        problems.append("REF_HMAC_SECRET must be at least 32 characters")
    if settings.web_origin.strip() in {"", "*"}:
        problems.append("WEB_ORIGIN must name the web app's origin")
    if not settings.is_sandbox and not settings.registry_enabled:
        problems.append("CHAIN_RPC_URL, REGISTRY_ADDRESS and RECORDER_PRIVATE_KEY are required outside dev and demo")
    if urlsplit(settings.database_url).port == TRANSACTION_POOLER_PORT:
        problems.append(
            "DATABASE_URL uses a transaction pooler (port 6543); money operations hold a lock across commits on one "
            "connection, so use the direct connection or the session pooler (port 5432)"
        )
    if settings.email_transport == "resend" and not settings.resend_api_key:
        problems.append("RESEND_API_KEY is required with EMAIL_TRANSPORT=resend")
    if settings.vaada_env == Env.DEMO and settings.email_transport != "outbox":
        problems.append("demo keeps email in the outbox; anyone can type an address there, so it must never send")
    if settings.vaada_env == Env.PRODUCTION and settings.email_transport != "resend":
        problems.append("production must send email through Resend")

    problems += check_fee_configuration(settings)
    if problems:
        raise BootGuardError("Refusing to start: " + "; ".join(problems))


@lru_cache
def get_settings() -> Settings:
    return Settings()
