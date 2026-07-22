"""Pydantic v2 schemas for request validation and response serialization."""
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ---------- auth ----------
class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str = Field(min_length=1, max_length=120)
    role: str = "citizen"


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class GoogleLogin(BaseModel):
    id_token: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    email: EmailStr
    full_name: str
    role: str
    created_at: datetime


# ---------- incidents ----------
class IncidentCreate(BaseModel):
    type: str
    severity: int = Field(ge=0, le=3, default=0)
    description: str | None = None
    zone: str | None = None
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    people_affected: int = Field(ge=0, default=0)


class IncidentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    code: str
    type: str
    severity: int
    status: str
    description: str | None
    zone: str | None
    lat: float
    lon: float
    people_affected: int
    verified: bool
    created_at: datetime
    resolved_at: datetime | None


class AgentRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    agent_key: str
    status: str
    confidence: float | None
    latency_ms: int | None
    output: dict | None
    created_at: datetime


class DispatchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    resource_id: uuid.UUID
    eta_min: int
    distance_km: float
    status: str


# ---------- agent invocation ----------
class TranscribeRequest(BaseModel):
    """Emergency call: pass an audio URL, or raw text for the demo path."""
    audio_url: str | None = None
    text: str | None = None
    language_hint: str | None = None


class VisionRequest(BaseModel):
    """Satellite/drone image reference for damage assessment."""
    image_url: str
    kind: str = "satellite"  # satellite|drone


class SocialCheckRequest(BaseModel):
    text: str
    author: str | None = None


class PipelineResult(BaseModel):
    incident_code: str
    steps: list[dict]
    summary: str
