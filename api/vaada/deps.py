from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request

from vaada.auth import AuthError, TokenVerifier
from vaada.context import AppContext
from vaada.models import User
from vaada.users import ensure_user, is_admin


def get_ctx(request: Request) -> AppContext:
    ctx: AppContext = request.app.state.ctx
    return ctx


def get_verifier(request: Request) -> TokenVerifier:
    verifier: TokenVerifier = request.app.state.verifier
    return verifier


Ctx = Annotated[AppContext, Depends(get_ctx)]


def _bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    return token.strip() if scheme.lower() == "bearer" and token.strip() else None


Verifier = Annotated[TokenVerifier, Depends(get_verifier)]
Authorization = Annotated[str | None, Header()]


async def _signed_in(ctx: AppContext, verifier: TokenVerifier, authorization: str | None) -> User | None:
    token = _bearer(authorization)
    if token is None:
        return None
    return await ensure_user(ctx, await verifier.verify(token))


async def optional_user(ctx: Ctx, verifier: Verifier, authorization: Authorization = None) -> User | None:
    """Public pages read the same with a stale token as without one: a deed link must open for anyone."""
    try:
        return await _signed_in(ctx, verifier, authorization)
    except AuthError:
        return None


async def current_user(ctx: Ctx, verifier: Verifier, authorization: Authorization = None) -> User:
    try:
        user = await _signed_in(ctx, verifier, authorization)
    except AuthError as exc:
        raise HTTPException(status_code=401, detail="Your sign-in has expired. Sign in again.") from exc
    if user is None:
        raise HTTPException(status_code=401, detail="Sign in to do that.")
    return user


async def admin_user(ctx: Ctx, user: Annotated[User, Depends(current_user)]) -> User:
    if not is_admin(ctx, user):
        raise HTTPException(status_code=404, detail="Not found.")
    return user


CurrentUser = Annotated[User, Depends(current_user)]
OptionalUser = Annotated[User | None, Depends(optional_user)]
AdminUser = Annotated[User, Depends(admin_user)]


def client_ip(request: Request, trust_proxy: bool) -> str | None:
    if trust_proxy:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None
