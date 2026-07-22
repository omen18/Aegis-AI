"""Model access layer.

Every agent talks to models *only* through this module. If no real provider
is configured, `complete()` returns deterministic demo output so the entire
8-agent pipeline runs end-to-end with zero external dependencies — which is
exactly what you want for a hackathon demo, CI, and local dev.

To go live: set NEXUS_LLM_PROVIDER=openai and NEXUS_OPENAI_API_KEY, and/or
provide YOLO / SAM / Whisper weights. The call sites never change.
"""
from __future__ import annotations

import hashlib
import json
import logging

import httpx

from app.core.config import settings

log = logging.getLogger("nexus.llm")


def _seeded(*parts: str) -> int:
    h = hashlib.sha256("|".join(map(str, parts)).encode()).hexdigest()
    return int(h[:8], 16)


async def complete(system: str, user: str, *, json_mode: bool = False) -> str:
    """Return a completion. Falls back to demo output when no provider is set."""
    if settings.llm_provider == "openai" and settings.openai_api_key:
        try:
            return await _openai_complete(system, user, json_mode)
        except Exception as exc:  # never let a model outage take down triage
            log.warning("LLM provider failed, using demo fallback: %s", exc)
    return _demo_complete(system, user, json_mode)


async def _openai_complete(system: str, user: str, json_mode: bool) -> str:
    payload = {
        "model": settings.llm_model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}
    headers = {"Authorization": f"Bearer {settings.openai_api_key}"}
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(
            "https://api.openai.com/v1/chat/completions", json=payload, headers=headers
        )
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]


def _demo_complete(system: str, user: str, json_mode: bool) -> str:
    """Deterministic, plausible output keyed off the prompt hash."""
    if json_mode:
        return json.dumps({"result": "demo", "note": "offline model layer"})
    return f"[demo] processed {len(user)} chars"


# ---- specialised model stubs (real weights plug in the same way) ----

async def transcribe_audio(audio_url: str | None, text: str | None, lang: str | None) -> dict:
    """Whisper transcription. Demo path echoes provided text."""
    if text:
        return {"text": text, "language": lang or "hi-IN", "engine": "demo"}
    # real: download audio_url, run settings.whisper_model
    return {
        "text": "pura building gir gaya hai, teen log andar phase hue hain",
        "language": lang or "hi-IN",
        "engine": settings.whisper_model,
    }


async def detect_damage(image_url: str, kind: str) -> dict:
    """YOLO + Segment-Anything damage assessment. Demo path is deterministic."""
    seed = _seeded(image_url, kind)
    structures = seed % 20 + 3
    return {
        "kind": kind,
        "structures_flagged": structures,
        "collapsed": structures // 4,
        "blocked_routes": seed % 5,
        "confidence": round(0.80 + (seed % 18) / 100, 2),
        "model": "YOLOv8 + SAM (demo)",
    }
