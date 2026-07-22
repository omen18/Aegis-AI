"""Pytest configuration and fixtures.

Sets up database schema for integration tests before running test suite.
"""
import pytest_asyncio

import app.models  # noqa: F401 — ensure all SQLAlchemy models are registered
from app.core.database import Base, engine


@pytest_asyncio.fixture(autouse=True)
async def setup_database():
    """Auto-create all ORM tables before tests."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
