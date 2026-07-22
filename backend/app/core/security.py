"""Password hashing, JWT tokens, and Google Sign-In verification."""
from datetime import datetime, timedelta, timezone

import httpx
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(raw: str) -> str:
    return _pwd.hash(raw)


def verify_password(raw: str, hashed: str) -> bool:
    return _pwd.verify(raw, hashed)


def _create_token(sub: str, role: str, ttl: timedelta, kind: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": sub, "role": role, "type": kind, "iat": now, "exp": now + ttl}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_access_token(sub: str, role: str) -> str:
    return _create_token(sub, role, timedelta(minutes=settings.access_token_ttl_min), "access")


def create_refresh_token(sub: str, role: str) -> str:
    return _create_token(sub, role, timedelta(days=settings.refresh_token_ttl_days), "refresh")


def decode_token(token: str) -> dict:
    """Raises JWTError if invalid/expired."""
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])


async def verify_google_id_token(id_token: str) -> dict | None:
    """Verify a Google Sign-In id_token via Google's tokeninfo endpoint.

    Returns the claims dict (email, name, sub, ...) or None if invalid.
    In production prefer local JWKS verification; this keeps the demo simple.
    """
    url = "https://oauth2.googleapis.com/tokeninfo"
    async with httpx.AsyncClient(timeout=5) as client:
        resp = await client.get(url, params={"id_token": id_token})
    if resp.status_code != 200:
        return None
    claims = resp.json()
    if settings.google_client_id and claims.get("aud") != settings.google_client_id:
        return None
    return claims


__all__ = [
    "hash_password", "verify_password", "create_access_token",
    "create_refresh_token", "decode_token", "verify_google_id_token", "JWTError",
]
