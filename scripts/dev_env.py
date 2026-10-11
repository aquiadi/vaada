"""Writes the dev env files from what `make dev` just started: Supabase's status, the registry deployed
to Anvil, and secrets generated once and kept in .dev/secrets.json.

Usage: python scripts/dev_env.py .dev/supabase-status.json
"""

import json
import secrets
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEV = ROOT / ".dev"
# Anvil's well-known second account; it only ever exists on a local chain.
ANVIL_RECORDER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"


def load_secrets() -> dict[str, str]:
    path = DEV / "secrets.json"
    stored: dict[str, str] = json.loads(path.read_text()) if path.exists() else {}
    for name in ("PERSONA_TOKEN_SECRET", "REF_HMAC_SECRET"):
        stored.setdefault(name, secrets.token_urlsafe(48))
    path.write_text(json.dumps(stored, indent=2))
    return stored


def supabase_values(status_path: Path) -> dict[str, str]:
    status = json.loads(status_path.read_text())
    api_url = status.get("API_URL") or status.get("api_url")
    key = status.get("PUBLISHABLE_KEY") or status.get("ANON_KEY") or status.get("anon_key")
    db_url = status.get("DB_URL") or status.get("db_url")
    service_key = status.get("SECRET_KEY") or status.get("SERVICE_ROLE_KEY") or status.get("service_role_key") or ""
    if not (api_url and key and db_url):
        raise SystemExit(f"supabase status is missing API_URL, a publishable/anon key or DB_URL: {sorted(status)}")
    return {"SUPABASE_URL": api_url, "SUPABASE_ANON_KEY": key, "SUPABASE_SERVICE_ROLE_KEY": service_key, "DATABASE_URL": db_url}


def registry_address() -> str:
    deployment = ROOT / "contracts" / "deployments" / "31337.json"
    if not deployment.exists():
        raise SystemExit("The registry isn't deployed to Anvil yet. Run make contracts.")
    return str(json.loads(deployment.read_text())["registry"])


def main() -> None:
    DEV.mkdir(exist_ok=True)
    status_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEV / "supabase-status.json"
    stored = load_secrets()
    values = {
        "VAADA_ENV": "dev",
        **supabase_values(status_path),
        "REDIS_URL": "redis://127.0.0.1:6379/0",
        "WEB_ORIGIN": "http://localhost:5173,http://127.0.0.1:5173",
        "API_PUBLIC_URL": "http://127.0.0.1:8000",
        "PERSONA_SWITCHER_ENABLED": "true",
        "PERSONA_TOKEN_SECRET": stored["PERSONA_TOKEN_SECRET"],
        "DEV_TOOLS_ENABLED": "true",
        "PAYMENTS_GATEWAY": "fake",
        "CHAIN_RPC_URL": "http://127.0.0.1:8545",
        "CHAIN_ID": "31337",
        "REGISTRY_ADDRESS": registry_address(),
        "RECORDER_PRIVATE_KEY": ANVIL_RECORDER_KEY,
        "REF_HMAC_SECRET": stored["REF_HMAC_SECRET"],
        "EMAIL_TRANSPORT": "outbox",
        "ADMIN_EMAILS": "desk@vaada.dev",
        "RATE_LIMIT_ENABLED": "false",
        "LOG_LEVEL": "INFO",
    }
    (DEV / "api.env").write_text("".join(f"{k}={v}\n" for k, v in values.items()))
    (ROOT / "web" / ".env.development.local").write_text("VITE_API_URL=http://127.0.0.1:8000\n")
    print(f"wrote {DEV / 'api.env'} and web/.env.development.local")


if __name__ == "__main__":
    main()
