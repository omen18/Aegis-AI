"""Multi-agent orchestrator.

Builds a DAG from each agent's `depends_on`, computes a topological schedule,
and runs each stage's agents concurrently with asyncio.gather. An optional
async callback receives every AgentResult as it completes — that's the hook
the WebSocket layer uses to stream the reasoning timeline to the dashboard.

This is intentionally framework-agnostic. To run on LangGraph instead, map
each Agent to a node and each `depends_on` edge to a graph edge; the contract
(AgentContext in, AgentResult out) is unchanged.
"""
from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable

from app.agents.base import Agent, AgentContext, AgentResult
from app.agents.implementations import ALL_AGENTS

StepCallback = Callable[[AgentResult], Awaitable[None]]


def _topo_stages(agents: list[Agent]) -> list[list[Agent]]:
    """Group agents into stages; every agent in a stage has all deps satisfied
    by earlier stages, so a stage can run fully in parallel."""
    by_key = {a.key: a for a in agents}
    resolved: set[str] = set()
    stages: list[list[Agent]] = []
    remaining = list(agents)
    while remaining:
        stage = [a for a in remaining if all(d in resolved for d in a.depends_on if d in by_key)]
        if not stage:  # cycle guard
            raise ValueError("Cyclic agent dependency detected")
        stages.append(stage)
        resolved |= {a.key for a in stage}
        remaining = [a for a in remaining if a.key not in resolved]
    return stages


class Orchestrator:
    def __init__(self, agents: list[Agent] | None = None):
        self.agents = agents or ALL_AGENTS
        self.stages = _topo_stages(self.agents)

    async def run(
        self,
        incident: dict,
        signals: dict | None = None,
        on_step: StepCallback | None = None,
    ) -> tuple[AgentContext, list[AgentResult]]:
        ctx = AgentContext(incident=incident, signals=signals or {})
        results: list[AgentResult] = []
        for stage in self.stages:
            async def _one(agent: Agent) -> AgentResult:
                res = await agent.run(ctx)
                if on_step:
                    await on_step(res)
                return res

            stage_results = await asyncio.gather(*[_one(a) for a in stage])
            results.extend(stage_results)
        return ctx, results

    def summarize(self, ctx: AgentContext) -> str:
        t = ctx.outputs.get("triage", {})
        v = ctx.outputs.get("vector", {})
        o = ctx.outputs.get("oracle", {})
        return (
            f"{t.get('level', 'UNKNOWN')} incident · {t.get('persons_at_risk', 0)} at risk · "
            f"{o.get('recommended_teams', 0)} team(s) → {o.get('priority_zone', '?')} · "
            f"ETA {v.get('eta_min', '?')}m over {v.get('distance_km', '?')}km"
        )


orchestrator = Orchestrator()
