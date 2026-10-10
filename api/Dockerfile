# One image for the API and the worker; Railway runs it with a different start command for each.
FROM python:3.12-slim-bookworm

COPY --from=ghcr.io/astral-sh/uv:0.11.32 /uv /usr/local/bin/uv

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev --no-install-project

COPY alembic.ini ./
COPY alembic ./alembic
COPY vaada ./vaada
RUN uv sync --frozen --no-dev

RUN useradd --system --uid 10001 vaada
USER vaada

EXPOSE 8000
CMD ["sh", "-c", "uvicorn vaada.main:app_factory --factory --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips '*'"]
