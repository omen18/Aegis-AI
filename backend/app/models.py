"""ORM models — normalized to 3NF.

Geospatial columns are modelled here as plain lat/lon floats for ORM
portability; the physical schema (see app/db/schema.sql) promotes them to
PostGIS GEOGRAPHY(POINT) columns with GiST indexes for real spatial queries.
"""
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, DateTime, Float, ForeignKey, Integer, String, Text, func, JSON, Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def _pk() -> Mapped[uuid.UUID]:
    return mapped_column(Uuid, primary_key=True, default=uuid.uuid4)


class User(Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = _pk()
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)  # null => oauth-only
    full_name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(20), default="citizen", index=True)
    google_sub: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    reports: Mapped[list["Report"]] = relationship(back_populates="reporter")


class Incident(Base):
    __tablename__ = "incidents"
    id: Mapped[uuid.UUID] = _pk()
    code: Mapped[str] = mapped_column(String(24), unique=True, index=True)
    type: Mapped[str] = mapped_column(String(32), index=True)          # collapse|flood|fire|...
    severity: Mapped[int] = mapped_column(Integer, default=0)          # 0..3
    status: Mapped[str] = mapped_column(String(20), default="reported", index=True)  # reported|assessing|dispatched|resolved
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    zone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    people_affected: Mapped[int] = mapped_column(Integer, default=0)
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    reported_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    agent_runs: Mapped[list["AgentRun"]] = relationship(back_populates="incident", cascade="all, delete-orphan")
    dispatches: Mapped[list["Dispatch"]] = relationship(back_populates="incident", cascade="all, delete-orphan")
    reports: Mapped[list["Report"]] = relationship(back_populates="incident")


class AgentRun(Base):
    """One execution of one agent against one incident."""
    __tablename__ = "agent_runs"
    id: Mapped[uuid.UUID] = _pk()
    incident_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("incidents.id", ondelete="CASCADE"), index=True)
    agent_key: Mapped[str] = mapped_column(String(24), index=True)     # orbital|aerial|signal|...
    status: Mapped[str] = mapped_column(String(16), default="queued")  # queued|running|done|error
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    output: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    incident: Mapped["Incident"] = relationship(back_populates="agent_runs")


class Resource(Base):
    """A deployable asset: ambulance, rescue team, boat, medical unit."""
    __tablename__ = "resources"
    id: Mapped[uuid.UUID] = _pk()
    kind: Mapped[str] = mapped_column(String(24), index=True)          # ambulance|rescue_team|boat|medical
    callsign: Mapped[str] = mapped_column(String(24), unique=True)
    status: Mapped[str] = mapped_column(String(16), default="available", index=True)  # available|dispatched|enroute
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    capacity: Mapped[int] = mapped_column(Integer, default=1)

    dispatches: Mapped[list["Dispatch"]] = relationship(back_populates="resource")


class Dispatch(Base):
    __tablename__ = "dispatches"
    id: Mapped[uuid.UUID] = _pk()
    incident_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("incidents.id", ondelete="CASCADE"), index=True)
    resource_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("resources.id"), index=True)
    eta_min: Mapped[int] = mapped_column(Integer)
    distance_km: Mapped[float] = mapped_column(Float)
    route: Mapped[dict | None] = mapped_column(JSON, nullable=True)    # GeoJSON LineString
    status: Mapped[str] = mapped_column(String(16), default="assigned")  # assigned|enroute|arrived
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    incident: Mapped["Incident"] = relationship(back_populates="dispatches")
    resource: Mapped["Resource"] = relationship(back_populates="dispatches")


class Report(Base):
    """Inbound signal: an emergency call, a social post, or a sensor reading."""
    __tablename__ = "reports"
    id: Mapped[uuid.UUID] = _pk()
    incident_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("incidents.id"), nullable=True, index=True)
    source: Mapped[str] = mapped_column(String(16), index=True)        # call|social|sensor
    raw_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    language: Mapped[str | None] = mapped_column(String(12), nullable=True)
    translated_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    authenticity: Mapped[float | None] = mapped_column(Float, nullable=True)  # 0..1 (VERITAS)
    reported_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    incident: Mapped["Incident"] = relationship(back_populates="reports")
    reporter: Mapped["User"] = relationship(back_populates="reports")


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[uuid.UUID] = _pk()
    target_role: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)  # broadcast to a role
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    incident_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("incidents.id"), nullable=True)
    level: Mapped[str] = mapped_column(String(12), default="info")     # info|warning|critical
    message: Mapped[str] = mapped_column(Text)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[uuid.UUID] = _pk()
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(48))
    entity: Mapped[str] = mapped_column(String(32))
    entity_id: Mapped[str | None] = mapped_column(String(48), nullable=True)
    meta: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
