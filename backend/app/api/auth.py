"""Authentication: email/password, Google Sign-In, JWT refresh."""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import Role, get_current_user
from app.core.security import (
    create_access_token, create_refresh_token, decode_token, hash_password,
    verify_google_id_token, verify_password, JWTError,
)
from app.models import User
from app.schemas import GoogleLogin, TokenPair, UserOut, UserRegister

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=201)
async def register(body: UserRegister, db: AsyncSession = Depends(get_db)):
    if body.role not in {r.value for r in Role}:
        raise HTTPException(400, "Invalid role")
    exists = await db.scalar(select(User).where(User.email == body.email))
    if exists:
        raise HTTPException(409, "Email already registered")
    user = User(
        email=body.email,
        hashed_password=hash_password(body.password),
        full_name=body.full_name,
        role=body.role,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


@router.post("/login", response_model=TokenPair)
async def login(form: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    user = await db.scalar(select(User).where(User.email == form.username))
    if not user or not user.hashed_password or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    sub = str(user.id)
    return TokenPair(
        access_token=create_access_token(sub, user.role),
        refresh_token=create_refresh_token(sub, user.role),
    )


@router.post("/google", response_model=TokenPair)
async def google_login(body: GoogleLogin, db: AsyncSession = Depends(get_db)):
    claims = await verify_google_id_token(body.id_token)
    if not claims:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid Google token")
    email = claims["email"]
    user = await db.scalar(select(User).where(User.email == email))
    if not user:
        user = User(
            email=email,
            full_name=claims.get("name", email.split("@")[0]),
            google_sub=claims.get("sub"),
            role=Role.CITIZEN.value,
        )
        db.add(user)
        await db.flush()
        await db.refresh(user)
    sub = str(user.id)
    return TokenPair(
        access_token=create_access_token(sub, user.role),
        refresh_token=create_refresh_token(sub, user.role),
    )


@router.post("/refresh", response_model=TokenPair)
async def refresh(refresh_token: str, db: AsyncSession = Depends(get_db)):
    try:
        payload = decode_token(refresh_token)
        if payload.get("type") != "refresh":
            raise HTTPException(401, "Not a refresh token")
        sub, role = payload["sub"], payload["role"]
    except JWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")
    return TokenPair(
        access_token=create_access_token(sub, role),
        refresh_token=create_refresh_token(sub, role),
    )


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return user
