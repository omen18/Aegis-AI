"""Incidents API — the operational core.

Creating an incident kicks off the full 8-agent pipeline, persists each
AgentRun and the resulting Dispatch, and streams every step to connected
dashboards over the WebSocket. Reads are open to any authenticated user;
creating/resolving requires an operational role (volunteer and above).
"""
from __future__ import annotations

import random

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agents.base import AgentResult
from app.agents.orchestrator import orchestrator
from app.api.ws import manager
from app.core.database import get_db
from app.core.deps import Role, get_current_user, require_role
from app.models import AgentRun, Dispatch, Incident, Resource, User
from app.schemas import AgentRunOut, IncidentCreate, IncidentOut

router = APIRouter(prefix="/incidents", tags=["incidents"])


def _code() -> str:
    return f"INC-{random.randint(10000, 99999)}"


@router.post("", response_model=IncidentOut, status_code=201)
async def create_incident(
    body: IncidentCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.VOLUNTEER)),
):
    incident = Incident(code=_code(), status="assessing", reported_by=user.id, **body.model_dump())
    db.add(incident)
    await db.flush()
    await db.refresh(incident)

    await manager.broadcast("incident.created", IncidentOut.model_validate(incident).model_dump())

    # ---- run the agent mesh, streaming each step ----
    async def on_step(res: AgentResult) -> None:
        db.add(AgentRun(
            incident_id=incident.id, agent_key=res.agent_key, status=res.status,
            confidence=res.confidence, latency_ms=res.latency_ms, output=res.output,
        ))
        await manager.broadcast("agent.step", {
            "incident_code": incident.code,
            "agent_key": res.agent_key,
            "output": res.output,
            "confidence": res.confidence,
            "latency_ms": res.latency_ms,
        })

    inc_dict = {
        "code": incident.code, "type": incident.type, "severity": incident.severity,
        "zone": incident.zone, "lat": incident.lat, "lon": incident.lon,
        "people_affected": incident.people_affected,
    }
    ctx, _ = await orchestrator.run(inc_dict, signals={}, on_step=on_step)

    # ---- materialize the dispatch decision ----
    vec = ctx.outputs.get("vector", {})
    ambulance = await db.scalar(
        select(Resource).where(Resource.kind == "ambulance", Resource.status == "available").limit(1)
    )
    if ambulance and vec:
        dispatch = Dispatch(
            incident_id=incident.id, resource_id=ambulance.id,
            eta_min=vec.get("eta_min", 10), distance_km=vec.get("distance_km", 0.0),
            route=vec.get("route"), status="assigned",
        )
        ambulance.status = "dispatched"
        db.add(dispatch)
        incident.status = "dispatched"
        await manager.broadcast("dispatch.created", {
            "incident_code": incident.code, "callsign": ambulance.callsign,
            "eta_min": dispatch.eta_min, "distance_km": dispatch.distance_km,
        })

    await db.flush()
    await db.refresh(incident)
    return incident


@router.get("", response_model=list[IncidentOut])
async def list_incidents(
    status_filter: str | None = Query(None, alias="status"),
    limit: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = select(Incident).order_by(Incident.created_at.desc()).limit(limit)
    if status_filter:
        q = q.where(Incident.status == status_filter)
    rows = (await db.scalars(q)).all()
    return list(rows)


@router.get("/{incident_id}", response_model=IncidentOut)
async def get_incident(incident_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    inc = await db.get(Incident, incident_id)
    if not inc:
        raise HTTPException(404, "Incident not found")
    return inc


@router.get("/{incident_id}/runs", response_model=list[AgentRunOut])
async def get_incident_runs(incident_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (await db.scalars(
        select(AgentRun).where(AgentRun.incident_id == incident_id).order_by(AgentRun.created_at)
    )).all()
    return list(rows)


@router.post("/{incident_id}/resolve", response_model=IncidentOut)
async def resolve_incident(
    incident_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(Role.GOVERNMENT)),
):
    from datetime import datetime, timezone
    inc = await db.get(Incident, incident_id)
    if not inc:
        raise HTTPException(404, "Incident not found")
    inc.status = "resolved"
    inc.resolved_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(inc)
    return inc
