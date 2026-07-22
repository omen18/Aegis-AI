"""NEXUS AI — FastAPI application entrypoint."""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import agents, auth, incidents, ws
from app.core.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    # place warm-up here (model preload, redis ping). Kept light for demo.
    yield


app = FastAPI(
    title="NEXUS AI",
    description="Autonomous Disaster Response Intelligence Platform — 8-agent mesh API.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix=settings.api_prefix)
app.include_router(incidents.router, prefix=settings.api_prefix)
app.include_router(agents.router, prefix=settings.api_prefix)
app.include_router(ws.router)  # /ws (no version prefix)


@app.get("/health", tags=["meta"])
async def health():
    return {"status": "ok", "service": settings.app_name, "env": settings.env}


@app.get("/", tags=["meta"])
async def root():
    return {"service": "NEXUS AI", "docs": "/docs", "realtime": "/ws"}
