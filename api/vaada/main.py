import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from redis.asyncio import Redis
from starlette.exceptions import HTTPException as StarletteHTTPException

from vaada.auth import TokenVerifier
from vaada.build import build_context, job_queue
from vaada.config import Settings, get_settings
from vaada.context import AppContext
from vaada.logs import configure_logging, configure_sentry
from vaada.money.errors import MoneyError
from vaada.money.payouts import PayoutProblem
from vaada.routes import account, admin, deals, dev, public, webhooks
from vaada.terms import TermsProblems

log = logging.getLogger(__name__)


def _friendly(errors: list[dict[str, object]]) -> str:
    first = errors[0] if errors else {}
    loc = first.get("loc")
    parts = loc if isinstance(loc, list | tuple) else ()
    where = ".".join(str(p) for p in parts if p not in ("body", "query", "path"))
    message = str(first.get("msg", "Something in this request isn't right.")).removeprefix("Value error, ")
    return f"{where}: {message}" if where else message


def install_handlers(app: FastAPI) -> None:
    @app.exception_handler(MoneyError)
    async def money_error(_: Request, exc: MoneyError) -> JSONResponse:
        body: dict[str, object] = {"error": exc.code, "message": exc.message}
        if isinstance(exc, PayoutProblem):
            body["field"] = exc.field
        return JSONResponse(status_code=exc.status_code, content=body)

    @app.exception_handler(TermsProblems)
    async def terms_problems(_: Request, exc: TermsProblems) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={
                "error": "terms",
                "message": "Some blanks need attention before this deed can go out.",
                "problems": [p.model_dump() for p in exc.problems],
            },
        )

    @app.exception_handler(RequestValidationError)
    async def validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        errors = list(exc.errors())
        # An id in the address that can't be one (a truncated link) means there's nothing there.
        if any(e.get("loc", ())[:1] == ("path",) for e in errors):
            return JSONResponse(
                status_code=404, content={"error": "not_found", "message": "That doesn't exist, or you can't see it."}
            )
        field = next((str(e["loc"][-1]) for e in errors if e.get("loc")), None)
        return JSONResponse(status_code=422, content={"error": "invalid", "message": _friendly(errors), "field": field})

    @app.exception_handler(StarletteHTTPException)
    async def http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": "http", "message": exc.detail if isinstance(exc.detail, str) else "Not found."},
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(Exception)
    async def unexpected(_: Request, exc: Exception) -> JSONResponse:
        sentry_sdk.capture_exception(exc)
        log.exception("unhandled error")
        return JSONResponse(
            status_code=500,
            content={
                "error": "internal",
                "message": "Something went wrong on our side and nothing was changed. Try again, and if it keeps "
                "happening, write to us.",
            },
        )


def create_app(ctx: AppContext | None = None, *, settings: Settings | None = None) -> FastAPI:
    """With `ctx`, the app uses it as is (tests). Without, it builds one from the environment at startup."""
    settings = ctx.settings if ctx else (settings or get_settings())

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        owned = ctx is None
        context = ctx or await build_context(settings)
        redis: Redis | None = None
        if owned:
            queue = await job_queue(settings)
            redis = queue

            async def kick(job: str) -> None:
                try:
                    await queue.enqueue_job(job, _job_id=f"kick:{job}")
                except OSError as exc:
                    log.warning("could not enqueue %s: %s", job, type(exc).__name__)

            context.kick = kick
        app.state.ctx = context
        app.state.redis = redis
        app.state.verifier = TokenVerifier(settings)
        try:
            yield
        finally:
            if owned:
                if redis is not None:
                    await redis.aclose()
                await context.engine.dispose()

    if ctx is None:
        configure_logging(settings)
        configure_sentry(settings, "api")
    app = FastAPI(
        title="Vaada",
        lifespan=lifespan,
        docs_url="/docs" if settings.is_sandbox else None,
        redoc_url=None,
        openapi_url="/openapi.json" if settings.is_sandbox else None,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.web_origins,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
        allow_credentials=False,
        max_age=600,
    )

    if settings.dev_tools_enabled:

        @app.middleware("http")
        async def refresh_clock(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
            await request.app.state.ctx.clock.refresh()
            return await call_next(request)

    @app.middleware("http")
    async def no_store(request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        response = await call_next(request)
        response.headers.setdefault("Cache-Control", "no-store")
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    install_handlers(app)
    for router in (account.router, deals.router, public.router, webhooks.router, admin.router):
        app.include_router(router)
    if settings.persona_switcher_enabled or settings.dev_tools_enabled:
        app.include_router(dev.router)
    return app


def app_factory() -> FastAPI:
    return create_app()
