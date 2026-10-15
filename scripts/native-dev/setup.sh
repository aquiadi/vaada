#!/usr/bin/env bash
# One-time setup of the Docker-free dev stack in a fresh container that can't pull Docker images. Installs
# Postgres 16, Redis, Foundry, Supabase Auth v2.182.1, Mailpit and the Supabase CLI into .dev/native, then does
# what make dev does after its infra step: signing key, registry, env, migrations, seed, and starts everything.
set -euo pipefail
REPO=$(cd "$(dirname "$0")/../.." && pwd)
N=$REPO/.dev/native
mkdir -p "$N/bin" "$N/gotrue" "$N/logs"
export PATH="$HOME/.foundry/bin:$PATH"
cd "$REPO"

if ! command -v redis-server >/dev/null || [ ! -x /usr/lib/postgresql/16/bin/pg_ctl ]; then
  apt-get update -qq && apt-get install -y -qq redis-server postgresql-16
fi
fetch() { curl -fsSL "$1" | tar -xz -C "$2"; }
[ -x "$N/bin/mailpit" ] || fetch https://github.com/axllent/mailpit/releases/latest/download/mailpit-linux-amd64.tar.gz "$N/bin"
[ -x "$N/gotrue/auth" ] || fetch https://github.com/supabase/auth/releases/download/v2.182.1/auth-v2.182.1-x86.tar.gz "$N/gotrue"
[ -x "$N/bin/supabase" ] || fetch https://github.com/supabase/cli/releases/latest/download/supabase_linux_amd64.tar.gz "$N/bin"
command -v anvil >/dev/null || { curl -fsSL https://foundry.paradigm.xyz | bash; "$HOME/.foundry/bin/foundryup"; }

PGDATA=/var/lib/postgresql/vaada/data
if [ ! -s "$PGDATA/PG_VERSION" ]; then
  id postgres >/dev/null 2>&1 || useradd -m postgres
  mkdir -p "$PGDATA" && chown -R postgres:postgres /var/lib/postgresql
  su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGDATA -U postgres --auth=trust" >/dev/null
fi

make deps
make signing-key SUPABASE="$N/bin/supabase"
bash scripts/native-dev/up.sh >/dev/null
mkdir -p .dev
printf '{"API_URL":"http://127.0.0.1:54321","ANON_KEY":"local-anon-key","DB_URL":"postgresql://postgres:postgres@127.0.0.1:54322/postgres"}\n' > .dev/supabase-status.json
make contracts env migrate seed
bash scripts/native-dev/up.sh
