"""Tests for the 8-agent orchestrator (runs fully offline via the demo model layer)."""
import pytest

from app.agents.implementations import ALL_AGENTS
from app.agents.orchestrator import Orchestrator, _topo_stages, orchestrator

SAMPLE = {
    "code": "INC-TEST", "type": "collapse", "severity": 3, "zone": "Old Harbour",
    "lat": 19.07, "lon": 72.87, "people_affected": 40,
}


@pytest.mark.asyncio
async def test_all_agents_produce_output():
    ctx, results = await orchestrator.run(SAMPLE, signals={"call": {"text": "building collapsed"}})
    assert len(results) == len(ALL_AGENTS) == 8
    for a in ALL_AGENTS:
        assert a.key in ctx.outputs
        assert ctx.outputs[a.key], f"{a.key} produced empty output"


@pytest.mark.asyncio
async def test_dependency_order_respected():
    stages = _topo_stages(ALL_AGENTS)
    seen: set[str] = set()
    for stage in stages:
        for agent in stage:
            for dep in agent.depends_on:
                assert dep in seen, f"{agent.key} ran before dependency {dep}"
        seen |= {a.key for a in stage}


@pytest.mark.asyncio
async def test_triage_uses_perception_signals():
    ctx, _ = await orchestrator.run(SAMPLE)
    triage = ctx.outputs["triage"]
    assert 0 <= triage["urgency_score"] <= 100
    assert triage["level"] in {"LOW", "MODERATE", "HIGH", "CRITICAL"}


@pytest.mark.asyncio
async def test_vector_produces_route_and_eta():
    ctx, _ = await orchestrator.run(SAMPLE)
    vec = ctx.outputs["vector"]
    assert vec["eta_min"] >= 3
    assert vec["route"]["type"] == "LineString"
    assert len(vec["route"]["coordinates"]) == 2


@pytest.mark.asyncio
async def test_summary_is_human_readable():
    ctx, _ = await orchestrator.run(SAMPLE)
    summary = orchestrator.summarize(ctx)
    assert "ETA" in summary and "at risk" in summary


def test_cycle_detection():
    class A(ALL_AGENTS[0].__class__):
        key, depends_on = "a", ("b",)
    class B(ALL_AGENTS[0].__class__):
        key, depends_on = "b", ("a",)
    with pytest.raises(ValueError):
        Orchestrator([A(), B()])
