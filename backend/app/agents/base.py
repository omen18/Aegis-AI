"""Agent framework primitives.

Each agent is a small, single-responsibility async unit. The orchestrator
wires them into a DAG (see orchestrator.py). This mirrors a LangGraph /
CrewAI node contract without hard-coupling to either library, so the mesh
runs anywhere; swapping in LangGraph is a drop-in at the orchestrator layer.
"""
from __future__ import annotations

import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class AgentContext:
    """Mutable blackboard shared across the pipeline for one incident."""
    incident: dict
    signals: dict = field(default_factory=dict)   # call/social/sensor payloads
    outputs: dict = field(default_factory=dict)    # agent_key -> output dict

    def get(self, agent_key: str, field_name: str, default: Any = None) -> Any:
        return self.outputs.get(agent_key, {}).get(field_name, default)


@dataclass
class AgentResult:
    agent_key: str
    output: dict
    confidence: float | None = None
    latency_ms: int = 0
    status: str = "done"


class Agent(ABC):
    key: str = "agent"
    name: str = "Agent"
    depends_on: tuple[str, ...] = ()

    @abstractmethod
    async def _run(self, ctx: AgentContext) -> tuple[dict, float | None]:
        """Return (output_dict, confidence)."""

    async def run(self, ctx: AgentContext) -> AgentResult:
        start = time.perf_counter()
        try:
            output, conf = await self._run(ctx)
            status = "done"
        except Exception as exc:  # isolate failures — one agent must not crash the mesh
            output, conf, status = {"error": str(exc)}, None, "error"
        latency = int((time.perf_counter() - start) * 1000)
        result = AgentResult(self.key, output, conf, latency, status)
        ctx.outputs[self.key] = output
        return result
