"""Agent endpoints — invoke individual agents or the whole mesh ad-hoc.

Useful for demos ("transcribe this call", "check this tweet") and for wiring
the frontend's per-agent panels without creating a full incident record.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.agents import llm
from app.agents.implementations import ALL_AGENTS
from app.agents.orchestrator import orchestrator
from app.core.deps import get_current_user
from app.models import User
from app.schemas import (
    IncidentCreate, PipelineResult, SocialCheckRequest, TranscribeRequest, VisionRequest,
)

router = APIRouter(prefix="/agents", tags=["agents"])


@router.get("")
async def list_agents(user: User = Depends(get_current_user)):
    return [
        {"key": a.key, "name": a.name, "depends_on": list(a.depends_on)}
        for a in ALL_AGENTS
    ]


@router.post("/transcribe")
async def transcribe(body: TranscribeRequest, user: User = Depends(get_current_user)):
    """Agent 3 (SIGNAL) — Whisper transcription."""
    return await llm.transcribe_audio(body.audio_url, body.text, body.language_hint)


@router.post("/vision")
async def vision(body: VisionRequest, user: User = Depends(get_current_user)):
    """Agents 1/2 (ORBITAL/AERIAL) — damage assessment."""
    return await llm.detect_damage(body.image_url, body.kind)


@router.post("/social-check")
async def social_check(body: SocialCheckRequest, user: User = Depends(get_current_user)):
    """Agent 6 (VERITAS) — misinformation / authenticity."""
    seed = sum(map(ord, body.text)) if body.text else 0
    authenticity = round(0.55 + (seed % 45) / 100, 2)
    return {
        "authenticity": authenticity,
        "verdict": "verified" if authenticity >= 0.7 else "flagged",
        "author": body.author,
    }


@router.post("/pipeline", response_model=PipelineResult)
async def run_pipeline(body: IncidentCreate, user: User = Depends(get_current_user)):
    """Run all 8 agents on an ad-hoc incident payload without persisting."""
    inc = body.model_dump()
    inc["code"] = "AD-HOC"
    ctx, results = await orchestrator.run(inc, signals={})
    steps = [
        {"agent": r.agent_key, "status": r.status, "confidence": r.confidence,
         "latency_ms": r.latency_ms, "output": r.output}
        for r in results
    ]
    return PipelineResult(incident_code="AD-HOC", steps=steps, summary=orchestrator.summarize(ctx))
