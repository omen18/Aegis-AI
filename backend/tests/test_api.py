"""API tests via in-process ASGI transport.

Health/metadata tests need no database. The auth/incident flow is marked
`integration` and runs in CI where a Postgres service is available
(`pytest -m integration`). Locally without a DB, run `pytest -m "not integration"`.
"""
import httpx
import pytest

from app.main import app

transport = httpx.ASGITransport(app=app)


@pytest.mark.asyncio
async def test_health_ok():
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_root_advertises_docs():
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.get("/")
    assert r.json()["docs"] == "/docs"


@pytest.mark.asyncio
async def test_protected_route_requires_auth():
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.get("/api/v1/agents")
    assert r.status_code == 401


@pytest.mark.integration
@pytest.mark.asyncio
async def test_register_login_and_pipeline():
    """End-to-end: register -> login -> run ad-hoc pipeline. Requires DB."""
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        email = "e2e@nexus.ai"
        await c.post("/api/v1/auth/register", json={
            "email": email, "password": "password123", "full_name": "E2E", "role": "government",
        })
        tok = (await c.post("/api/v1/auth/login", data={
            "username": email, "password": "password123",
        })).json()["access_token"]
        headers = {"Authorization": f"Bearer {tok}"}
        r = await c.post("/api/v1/agents/pipeline", headers=headers, json={
            "type": "flood", "severity": 2, "lat": 19.07, "lon": 72.87, "people_affected": 20,
        })
    assert r.status_code == 200
    body = r.json()
    assert len(body["steps"]) == 8
