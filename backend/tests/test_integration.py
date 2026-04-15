"""
Integration test that exercises the full REST API flow.

Run from the backend directory:
    python -m pytest tests/test_integration.py -v

This test does NOT require Ollama / Whisper / Piper to be running;
it validates the HTTP layer and database flow.
"""

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.db import init_db


@pytest_asyncio.fixture(autouse=True)
async def setup_db():
    await init_db()


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)  # type: ignore[arg-type]
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_health(client: AsyncClient):
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_scenario_crud(client: AsyncClient):
    resp = await client.post("/api/scenarios", json={
        "persona_type": "Rude",
        "objective": "Order a pizza",
        "target_url": "https://example.com",
        "difficulty": 7,
    })
    assert resp.status_code == 201
    scenario = resp.json()
    assert scenario["persona_type"] == "Rude"
    scenario_id = scenario["id"]

    resp = await client.get("/api/scenarios")
    assert resp.status_code == 200
    ids = [s["id"] for s in resp.json()]
    assert scenario_id in ids

    resp = await client.get(f"/api/scenarios/{scenario_id}")
    assert resp.status_code == 200
    assert resp.json()["objective"] == "Order a pizza"

    resp = await client.delete(f"/api/scenarios/{scenario_id}")
    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_call_flow(client: AsyncClient):
    resp = await client.post("/api/scenarios", json={
        "persona_type": "Impatient",
        "objective": "Return a defective laptop",
        "target_url": "https://example.com",
        "difficulty": 5,
    })
    scenario_id = resp.json()["id"]

    resp = await client.post(f"/api/calls/start/{scenario_id}")
    assert resp.status_code == 200
    call = resp.json()
    assert call["status"] == "active"
    call_id = call["id"]

    resp = await client.post(f"/api/calls/end/{call_id}")
    assert resp.status_code == 200
    assert resp.json()["status"] == "completed"


@pytest.mark.asyncio
async def test_scenario_not_found(client: AsyncClient):
    resp = await client.get("/api/scenarios/9999")
    assert resp.status_code == 404
