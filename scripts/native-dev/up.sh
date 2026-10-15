#!/usr/bin/env bash
# Starts whatever isn't running of the Docker-free dev stack: Postgres 16 on 54322, Redis, Anvil, Supabase Auth
# (GoTrue behind authproxy.py on 54321, Mailpit on 54324/54325), then the API, the worker and Vite on 5173.
# Run setup.sh once per fresh container first. Safe to run again after a container restart.
REPO=$(cd "$(dirname "$0")/../.." && pwd)
N=$REPO/.dev/native
L=$N/logs
mkdir -p "$L"
export PATH="$HOME/.foundry/bin:$PATH"
PGBIN=/usr/lib/postgresql/16/bin
PGDATA=/var/lib/postgresql/vaada/data

if ! pg_isready -h 127.0.0.1 -p 54322 >/dev/null 2>&1; then
  rm -f "$PGDATA/postmaster.pid"
  su postgres -c "$PGBIN/pg_ctl -D $PGDATA -o '-p 54322 -k /tmp -c max_connections=300 -c fsync=off -c synchronous_commit=off' -l /var/lib/postgresql/vaada/log.txt start" >/dev/null
fi
redis-cli ping >/dev/null 2>&1 || redis-server --port 6379 --daemonize yes --save "" --appendonly no >/dev/null
rpc='{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
if ! curl -s -m 2 -X POST -H 'Content-Type: application/json' --data "$rpc" http://127.0.0.1:8545 >/dev/null; then
  mkdir -p /var/lib/anvil
  nohup anvil --host 127.0.0.1 --port 8545 --chain-id 31337 --silent --state /var/lib/anvil/state.json >"$L/anvil.log" 2>&1 &
fi
for _ in $(seq 1 20); do pg_isready -h 127.0.0.1 -p 54322 >/dev/null 2>&1 && break; sleep 0.5; done

psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -qc "create schema if not exists auth" >/dev/null
curl -s -m 1 http://127.0.0.1:54324/api/v1/info >/dev/null || nohup "$N/bin/mailpit" --listen 127.0.0.1:54324 --smtp 127.0.0.1:54325 --smtp-auth-accept-any --smtp-auth-allow-insecure >"$L/mailpit.log" 2>&1 &
if ! curl -s -m 1 http://127.0.0.1:9999/health >/dev/null; then
  (cd "$N/gotrue" && \
  API_EXTERNAL_URL=http://127.0.0.1:54321/auth/v1 GOTRUE_API_HOST=127.0.0.1 PORT=9999 \
  GOTRUE_DB_DRIVER=postgres DB_NAMESPACE=auth \
  GOTRUE_DB_DATABASE_URL="postgres://postgres:postgres@127.0.0.1:54322/postgres?search_path=auth&sslmode=disable" \
  GOTRUE_SITE_URL=http://localhost:5173 GOTRUE_URI_ALLOW_LIST="*" \
  GOTRUE_JWT_SECRET=super-secret-jwt-token-with-at-least-32-characters-long \
  GOTRUE_JWT_KEYS="$(cat "$REPO/supabase/signing_keys.json")" GOTRUE_JWT_VALID_METHODS="HS256,RS256,ES256" \
  GOTRUE_JWT_ISSUER=http://127.0.0.1:54321/auth/v1 GOTRUE_JWT_AUD=authenticated GOTRUE_JWT_EXP=3600 \
  GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated GOTRUE_JWT_ADMIN_ROLES=service_role \
  GOTRUE_EXTERNAL_EMAIL_ENABLED=true GOTRUE_MAILER_AUTOCONFIRM=true GOTRUE_DISABLE_SIGNUP=false \
  GOTRUE_MAILER_OTP_EXP=3600 GOTRUE_MAILER_OTP_LENGTH=6 \
  GOTRUE_SMTP_HOST=127.0.0.1 GOTRUE_SMTP_PORT=54325 GOTRUE_SMTP_USER=x GOTRUE_SMTP_PASS=x \
  GOTRUE_SMTP_ADMIN_EMAIL=admin@vaada.local GOTRUE_SMTP_SENDER_NAME=Vaada \
  GOTRUE_MAILER_SUBJECTS_MAGIC_LINK="Your Vaada sign-in code" GOTRUE_MAILER_SUBJECTS_CONFIRMATION="Your Vaada sign-in code" \
  GOTRUE_MAILER_TEMPLATES_MAGIC_LINK=http://127.0.0.1:54321/templates/otp.html \
  GOTRUE_MAILER_TEMPLATES_CONFIRMATION=http://127.0.0.1:54321/templates/otp.html \
  GOTRUE_RATE_LIMIT_EMAIL_SENT=200 GOTRUE_SMTP_MAX_FREQUENCY=1s GOTRUE_LOG_LEVEL=info \
  nohup ./auth >"$L/gotrue.log" 2>&1 &)
fi
curl -s -m 1 http://127.0.0.1:54321/auth/v1/health >/dev/null || nohup python3 -I "$REPO/scripts/native-dev/authproxy.py" "$REPO/supabase/templates/otp.html" >"$L/authproxy.log" 2>&1 &

if [ -f "$REPO/.dev/api.env" ]; then
  cd "$REPO/api"
  if ! curl -s -m 2 http://127.0.0.1:8000/health >/dev/null; then
    VAADA_ENV_FILE=../.dev/api.env nohup .venv/bin/uvicorn vaada.main:app_factory --factory --host 127.0.0.1 --port 8000 >"$L/api.log" 2>&1 &
  fi
  pgrep -f "arq vaada[.]jobs" >/dev/null || VAADA_ENV_FILE=../.dev/api.env nohup .venv/bin/arq vaada.jobs.worker.WorkerSettings >"$L/worker.log" 2>&1 &
  cd "$REPO/web"
  curl -s -m 2 -o /dev/null http://127.0.0.1:5173/ || (setsid nohup node node_modules/vite/bin/vite.js --port 5173 --strictPort --host 127.0.0.1 >"$L/vite.log" 2>&1 &)
fi

for _ in $(seq 1 30); do curl -s -m 2 -o /dev/null http://127.0.0.1:5173/ && curl -s -m 2 http://127.0.0.1:8000/health >/dev/null && break; sleep 1; done
echo "postgres $(pg_isready -h 127.0.0.1 -p 54322 >/dev/null 2>&1 && echo up || echo down)"
echo "auth     $(curl -s -m 2 -o /dev/null -w '%{http_code}' http://127.0.0.1:54321/auth/v1/health)"
echo "api      $(curl -s -m 2 http://127.0.0.1:8000/health)"
echo "worker   $(pgrep -f 'arq vaada[.]jobs' >/dev/null && echo up || echo down)"
echo "web      $(curl -s -m 2 -o /dev/null -w '%{http_code}' http://127.0.0.1:5173/)"
