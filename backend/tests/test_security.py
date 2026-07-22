"""Unit tests for auth primitives (no database required)."""
import pytest

from app.core.deps import Role, _LADDER
from app.core.security import (
    create_access_token, create_refresh_token, decode_token,
    hash_password, verify_password,
)


def test_password_hash_roundtrip():
    h = hash_password("s3cret-pass")
    assert h != "s3cret-pass"
    assert verify_password("s3cret-pass", h)
    assert not verify_password("wrong", h)


def test_access_token_carries_claims():
    tok = create_access_token("user-123", "government")
    claims = decode_token(tok)
    assert claims["sub"] == "user-123"
    assert claims["role"] == "government"
    assert claims["type"] == "access"


def test_refresh_token_type():
    claims = decode_token(create_refresh_token("u", "citizen"))
    assert claims["type"] == "refresh"


def test_role_ladder_ordering():
    # admin outranks government outranks citizen
    assert _LADDER.index(Role.ADMIN) > _LADDER.index(Role.GOVERNMENT)
    assert _LADDER.index(Role.GOVERNMENT) > _LADDER.index(Role.CITIZEN)


def test_tampered_token_rejected():
    tok = create_access_token("u", "admin")
    with pytest.raises(Exception):
        decode_token(tok + "tamper")
