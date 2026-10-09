import pytest

from tests.conftest import make_settings
from vaada.config import BootGuardError, check_boot_guards

LIVE = {
    "payments_gateway": "razorpay",
    "persona_switcher_enabled": False,
    "dev_tools_enabled": False,
    "razorpay_key_id": "rzp_live_abc",
    "razorpay_key_secret": "secret",
    "razorpay_webhook_secret": "whsec",
    "chain_rpc_url": "https://polygon-rpc.com",
    "registry_address": "0x" + "1" * 40,
    "recorder_private_key": "0x" + "2" * 64,
    "email_transport": "resend",
    "resend_api_key": "re_123",
}


def test_dev_with_fakes_boots(db_url: str) -> None:
    check_boot_guards(make_settings(db_url))


@pytest.mark.parametrize("env", ["staging", "production"])
@pytest.mark.parametrize(
    "unsafe",
    [{"persona_switcher_enabled": True}, {"payments_gateway": "fake"}, {"dev_tools_enabled": True}],
)
def test_sandbox_tools_refuse_to_boot_outside_dev_and_demo(db_url: str, env: str, unsafe: dict[str, object]) -> None:
    key = "rzp_live_abc" if env == "production" else "rzp_test_abc"
    with pytest.raises(BootGuardError, match="only allowed in dev and demo"):
        check_boot_guards(make_settings(db_url, vaada_env=env, **{**LIVE, "razorpay_key_id": key, **unsafe}))


def test_production_with_live_keys_boots(db_url: str) -> None:
    check_boot_guards(make_settings(db_url, vaada_env="production", **LIVE))


def test_demo_refuses_any_razorpay_key(db_url: str) -> None:
    with pytest.raises(BootGuardError, match="must not be set in demo"):
        check_boot_guards(make_settings(db_url, vaada_env="demo", razorpay_key_id="rzp_test_abc"))
    check_boot_guards(make_settings(db_url, vaada_env="demo"))


def test_staging_needs_test_keys_and_production_needs_live_keys(db_url: str) -> None:
    with pytest.raises(BootGuardError, match="must start with rzp_test_"):
        check_boot_guards(make_settings(db_url, vaada_env="staging", **LIVE))
    with pytest.raises(BootGuardError, match="must start with rzp_live_"):
        check_boot_guards(make_settings(db_url, vaada_env="production", **{**LIVE, "razorpay_key_id": "rzp_test_x"}))


def test_production_needs_the_registry_and_resend(db_url: str) -> None:
    with pytest.raises(BootGuardError, match="REGISTRY_ADDRESS"):
        check_boot_guards(make_settings(db_url, vaada_env="production", **{**LIVE, "registry_address": ""}))
    with pytest.raises(BootGuardError, match="Resend"):
        check_boot_guards(make_settings(db_url, vaada_env="production", **{**LIVE, "email_transport": "outbox"}))
