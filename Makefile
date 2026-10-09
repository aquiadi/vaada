SHELL := /bin/bash
.DEFAULT_GOAL := help
.PHONY: help dev check deps infra signing-key contracts env migrate seed run stop reset test test-api test-web test-contracts lint e2e screens

SUPABASE := npx --yes supabase@2.120.0
API_ENV := VAADA_ENV_FILE=../.dev/api.env

help: ## List the targets
	@grep -hE '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-16s %s\n", $$1, $$2}'

dev: check deps infra contracts env migrate seed run ## Everything, from a fresh clone: infra, registry, env, migrations, seed, then API + worker + web

check: ## Check prerequisites (docker, node, pnpm, uv)
	@scripts/check-prereqs.sh

deps: ## Install Python and Node dependencies and the contract libraries
	git submodule update --init
	cd api && uv sync
	cd web && pnpm install --frozen-lockfile

signing-key:
	@test -s supabase/signing_keys.json || { \
		key=$$($(SUPABASE) gen signing-key --algorithm ES256 2>/dev/null | head -n 1); \
		echo "[$$key]" > supabase/signing_keys.json; echo "generated supabase/signing_keys.json"; }

infra: signing-key ## Start Redis, Anvil and local Supabase
	docker compose up -d --wait redis anvil
	$(SUPABASE) start
	mkdir -p .dev
	$(SUPABASE) status -o json > .dev/supabase-status.json

contracts: ## Deploy the registry to Anvil (skipped if it's already there)
	scripts/deploy-registry.sh

env: ## Write .dev/api.env and web/.env.development.local
	python3 scripts/dev_env.py .dev/supabase-status.json

migrate: ## Run database migrations
	cd api && $(API_ENV) uv run alembic upgrade head

seed: ## Seed personas and four deeds (dev and demo only; skips if already seeded)
	cd api && $(API_ENV) uv run python -m vaada.seed

run: ## Run the API, the worker and the web app
	cd api && uv run honcho -d .. -f ../Procfile.dev start

stop: ## Stop local infrastructure
	$(SUPABASE) stop
	docker compose stop

reset: ## Wipe the local database and chain, then start again with make dev
	$(SUPABASE) db reset --no-seed
	docker compose down -v
	rm -f contracts/deployments/31337.json

test: test-contracts test-api test-web ## Every fast test suite

test-api: ## API tests (needs Postgres at TEST_DATABASE_ADMIN_URL, default the Supabase local DB)
	cd api && uv run pytest -q

test-web: ## Normalizers, voice interpreter, agreement hashing, types and lint
	cd web && pnpm test && pnpm typecheck && pnpm lint

test-contracts: ## Foundry tests
	cd contracts && forge test

lint: ## Lint everything
	cd api && uv run ruff check . && uv run ruff format --check .
	cd web && pnpm lint
	cd contracts && forge fmt --check

e2e: ## Playwright end-to-end test of the whole dev flow (needs make dev running)
	cd web && pnpm e2e

screens: ## Screenshots of every route at 1440 and 390 in both themes, into docs/screens
	cd web && pnpm screens
