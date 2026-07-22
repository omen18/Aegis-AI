"""Reusable FastAPI dependencies: current user + Role-Based Access Control."""
from enum import StrEnum

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import JWTError, decode_token
from app.models import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.api_prefix}/auth/login")


class Role(StrEnum):
    CITIZEN = "citizen"
    VOLUNTEER = "volunteer"
    NGO = "ngo"
    GOVERNMENT = "government"
    ADMIN = "admin"


# ordered privilege ladder — higher index = more authority
_LADDER = [Role.CITIZEN, Role.VOLUNTEER, Role.NGO, Role.GOVERNMENT, Role.ADMIN]


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise credentials_exc
        user_id = payload.get("sub")
    except JWTError:
        raise credentials_exc

    user = await db.get(User, user_id)
    if user is None or not user.is_active:
        raise credentials_exc
    return user


def require_role(*allowed: Role):
    """Dependency factory: allow only users whose role is >= the lowest allowed
    role on the privilege ladder (admins pass everything)."""
    min_rank = min(_LADDER.index(r) for r in allowed)

    async def _guard(user: User = Depends(get_current_user)) -> User:
        if _LADDER.index(Role(user.role)) < min_rank:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires role >= {_LADDER[min_rank].value}",
            )
        return user

    return _guard
