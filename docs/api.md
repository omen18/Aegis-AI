# NEXUS AI — API Reference

Base URL: `http://localhost:8000`  ·  Version prefix: `/api/v1`
Interactive docs (OpenAPI/Swagger): `http://localhost:8000/docs`

All timestamps are ISO-8601 UTC. All IDs are UUIDs. Protected routes require
`Authorization: Bearer <access_token>`.

## Auth

| Method | Path | Body | Role | Description |
|---|---|---|---|---|
| POST | `/auth/register` | `{email, password, full_name, role}` | public | Create an account |
| POST | `/auth/login` | form `username`(=email)`, password` | public | Get JWT pair |
| POST | `/auth/google` | `{id_token}` | public | Google Sign-In → JWT pair |
| POST | `/auth/refresh` | `?refresh_token=` | public | Rotate tokens |
| GET | `/auth/me` | — | any | Current user |

**Login example**
```bash
curl -X POST localhost:8000/api/v1/auth/login \
  -d 'username=gov@nexus.ai&password=password123'
# → {"access_token":"...","refresh_token":"...","token_type":"bearer"}
```

## Incidents

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/incidents` | volunteer+ | Create incident → runs 8-agent pipeline, streams steps, auto-dispatches |
| GET | `/incidents?status=&limit=` | any | List incidents |
| GET | `/incidents/{id}` | any | Incident detail |
| GET | `/incidents/{id}/runs` | any | All agent runs for an incident |
| POST | `/incidents/{id}/resolve` | government+ | Mark resolved |

**Create example**
```bash
curl -X POST localhost:8000/api/v1/incidents \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"type":"collapse","severity":3,"zone":"Old Harbour",
       "lat":19.07,"lon":72.87,"people_affected":40}'
```

## Agents

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/agents` | any | Agent registry + dependency graph |
| POST | `/agents/transcribe` | any | SIGNAL — Whisper transcription |
| POST | `/agents/vision` | any | ORBITAL/AERIAL — damage assessment |
| POST | `/agents/social-check` | any | VERITAS — misinformation score |
| POST | `/agents/pipeline` | any | Run all 8 agents ad-hoc (no persistence) |

**Ad-hoc pipeline response**
```json
{
  "incident_code": "AD-HOC",
  "summary": "CRITICAL incident · 40 at risk · 3 team(s) → Old Harbour · ETA 9m over 5.1km",
  "steps": [
    {"agent":"orbital","status":"done","confidence":0.94,"latency_ms":2,"output":{...}},
    {"agent":"aerial","status":"done", ...},
    ...
  ]
}
```

## Realtime — WebSocket `/ws`

Connect to `ws://localhost:8000/ws`. Server pushes JSON envelopes:

```json
{ "type": "agent.step", "ts": "2026-...", "data": {
    "incident_code": "INC-12345", "agent_key": "triage",
    "output": {"urgency_score": 88, "level": "CRITICAL"},
    "confidence": 0.94, "latency_ms": 3 } }
```

Event types: `hello`, `incident.created`, `agent.step`, `dispatch.created`,
`notification`.

## Errors
Standard HTTP codes. Body: `{"detail": "..."}`.
`401` missing/expired token · `403` insufficient role · `404` not found ·
`409` conflict (duplicate) · `422` validation error.
