import asyncio
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

import jwt
from jwt import PyJWKClient

from vaada.config import Settings

PERSONA_ISSUER = "vaada-persona"
PERSONA_AUDIENCE = "vaada"


class AuthError(Exception):
    pass


@dataclass(frozen=True)
class Identity:
    user_id: uuid.UUID
    email: str | None
    phone: str | None
    full_name: str | None
    via_persona: bool


class TokenVerifier:
    """Verifies Supabase access tokens against the project's JWKS. In dev and demo it also accepts
    persona tokens minted by this API, and the boot guards keep those out of staging and production."""

    def __init__(self, settings: Settings) -> None:
        self._issuer = settings.supabase_url.rstrip("/") + "/auth/v1"
        self._jwks = PyJWKClient(self._issuer + "/.well-known/jwks.json", cache_keys=True, lifespan=600)
        self._audience = settings.supabase_jwt_audience
        self._persona_secret = settings.persona_token_secret if settings.persona_switcher_enabled else None

    async def verify(self, token: str) -> Identity:
        try:
            issuer = jwt.decode(token, options={"verify_signature": False}).get("iss")
        except jwt.InvalidTokenError as exc:
            raise AuthError("malformed token") from exc
        if issuer == PERSONA_ISSUER:
            return self._verify_persona(token)
        return await self._verify_supabase(token)

    def _verify_persona(self, token: str) -> Identity:
        if not self._persona_secret:
            raise AuthError("persona tokens are not accepted here")
        try:
            claims = jwt.decode(
                token,
                self._persona_secret,
                algorithms=["HS256"],
                issuer=PERSONA_ISSUER,
                audience=PERSONA_AUDIENCE,
                options={"require": ["exp", "sub", "iss", "aud"]},
            )
        except jwt.InvalidTokenError as exc:
            raise AuthError("invalid persona token") from exc
        return Identity(
            user_id=uuid.UUID(claims["sub"]),
            email=claims.get("email"),
            phone=None,
            full_name=claims.get("name"),
            via_persona=True,
        )

    async def _verify_supabase(self, token: str) -> Identity:
        try:
            signing_key = await asyncio.to_thread(self._jwks.get_signing_key_from_jwt, token)
            claims = jwt.decode(
                token,
                signing_key.key,
                algorithms=["ES256", "RS256", "EdDSA"],
                audience=self._audience,
                issuer=self._issuer,
                options={"require": ["exp", "sub", "iss", "aud"]},
            )
        except (jwt.InvalidTokenError, jwt.PyJWKClientError) as exc:
            raise AuthError("invalid token") from exc
        metadata = claims.get("user_metadata") or {}
        return Identity(
            user_id=uuid.UUID(claims["sub"]),
            email=(claims.get("email") or None),
            phone=(claims.get("phone") or None),
            full_name=metadata.get("full_name") or metadata.get("name"),
            via_persona=False,
        )


def mint_persona_token(
    secret: str, *, user_id: uuid.UUID, email: str, name: str, now: datetime, ttl: timedelta = timedelta(hours=12)
) -> str:
    claims = {
        "iss": PERSONA_ISSUER,
        "aud": PERSONA_AUDIENCE,
        "sub": str(user_id),
        "email": email,
        "name": name,
        "iat": int(now.timestamp()),
        "exp": int((now + ttl).timestamp()),
    }
    return jwt.encode(claims, secret, algorithm="HS256")
