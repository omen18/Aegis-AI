# Aegis AI — Autonomous Disaster Response Intelligence Platform

> A command platform where **eight autonomous AI agents** turn raw disaster
> signals — satellite tiles, drone feeds, emergency calls, social posts — into
> ranked, routed, dispatch-ready decisions, and put the machine's reasoning on
> screen in real time.

<p align="center"><em>8-agent mesh · FastAPI + PostGIS · Next.js glassmorphism command deck · WebSocket reasoning timeline</em></p>

---

## What this is (and what it honestly is not)

This is a **complete, runnable reference implementation**: a real backend
(auth, RBAC, normalized PostGIS schema, an 8-agent DAG orchestrator, REST +
WebSockets), a real Next.js command dashboard, container + k8s + Terraform
scaffolding, tests, and CI. `docker compose up` gives you a working system in
minutes.

The **model layer is pluggable and ships in demo mode** so the entire pipeline
runs offline with zero API keys — perfect for a hackathon demo, CI, and local
dev. The eight agents are wired with a common contract; dropping in real GPT /
Whisper / YOLOv8 / SAM is a config change (`NEXUS_LLM_PROVIDER=openai` + keys /
weights), not a rewrite. What no one can hand you in a zip is *trained,
validated production CV models for live disaster assessment* — that's data,
labeling, and evaluation work. This repo is the platform they plug into.

> ⚠️ **Decision-support, not autopilot.** Nothing here should dispatch real
> emergency services without human-in-the-loop review and rigorous validation.
> See [Responsible use](#responsible-use).

---

## The eight agents

| # | Agent | Job | Model (pluggable) |
|---|-------|-----|-------------------|
| 1 | **ORBITAL** | Satellite imagery → damaged buildings | YOLOv8 + SAM |
| 2 | **AERIAL**  | Drone footage → collapsed roofs, blocked roads | YOLOv8 + SAM |
| 3 | **SIGNAL**  | Transcribe emergency calls | Whisper |
| 4 | **TRIAGE**  | Fuse everything → urgency score | LLM + rules |
| 5 | **LINGUA**  | Translate any language + intent tagging | LLM |
| 6 | **VERITAS** | Detect fake/misleading social posts | LLM + cross-source |
| 7 | **ORACLE**  | Forecast where rescue teams should go | demand model |
| 8 | **VECTOR**  | Optimize ambulance routing | A* over road graph |

Perception (1,2) and intake (3→5→6) run **concurrently**; TRIAGE fuses them;
ORACLE forecasts; VECTOR routes. The orchestrator streams every step to the
dashboard as it happens. See [`docs/architecture.md`](docs/architecture.md).

---

## Quickstart

```bash
git clone <this-repo> && cd nexus-ai
cp .env.example .env            # defaults run fully offline (demo model layer)
docker compose up --build
```

- Dashboard → http://localhost:3000
- API + Swagger → http://localhost:8000/docs
- Realtime → ws://localhost:8000/ws

Seeded demo logins (password `password123`): `citizen@nexus.ai`,
`volunteer@nexus.ai`, `ngo@nexus.ai`, `gov@nexus.ai`, `admin@nexus.ai`.

### Run the backend alone

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m app.db.seed                    # needs Postgres; or skip for offline agent tests
uvicorn app.main:app --reload
```

### Run the dashboard alone
The dashboard ships with a self-contained live simulation, so it renders with
**no backend**:
```bash
cd frontend && npm install && npm run dev
```
To drive it from live backend data, use the `useLiveEvents()` hook
(`frontend/lib/useLiveEvents.ts`) — the integration point is documented inline.

---

## Tests

```bash
cd backend
pytest -m "not integration"    # unit tests, no services needed  (14 tests)
pytest                         # full suite (needs Postgres/Redis; CI runs this)
```

CI (`.github/workflows/ci.yml`) runs backend tests against a real Postgres/PostGIS
service, typechecks + builds the frontend, and publishes both images to GHCR.

---

## Project structure

```
nexus-ai/
├── backend/
│   ├── app/
│   │   ├── main.py               FastAPI app (routers, CORS, health)
│   │   ├── core/                 config · async DB · JWT/security · RBAC deps
│   │   ├── models.py             SQLAlchemy ORM (3NF)
│   │   ├── schemas.py            Pydantic v2
│   │   ├── api/                  auth · incidents · agents · ws
│   │   ├── agents/               llm(pluggable) · base · 8 agents · orchestrator
│   │   └── db/                   schema.sql (PostGIS DDL) · seed.py
│   ├── tests/                    security · orchestrator · api
│   ├── requirements.txt · Dockerfile · pytest.ini
├── frontend/                     Next.js 15 · React 19 · Tailwind
│   ├── app/                      layout · page · globals
│   ├── components/               NexusDashboard.jsx (the command deck)
│   └── lib/                      api · useLiveEvents (WS) · mapbox
├── docs/                         architecture.md · er-diagram.md · api.md
├── k8s/                          namespace · config · api deployment+HPA · ingress
├── terraform/                    AWS EKS + RDS(PostGIS) + ElastiCache
├── datasets/                     incidents · calls · resources · social posts
├── .github/workflows/ci.yml      lint · test · build · publish
└── docker-compose.yml            db · redis · api · frontend
```

---

## Auth & roles

JWT (access + refresh) with email/password **and** Google Sign-In
(`POST /auth/google`). Five roles on a privilege ladder enforced by
`require_role(...)`:

`citizen → volunteer → ngo → government → admin`

Example: creating an incident needs `volunteer+`; resolving one needs
`government+`. Full endpoint map in [`docs/api.md`](docs/api.md).

---

## Dashboard

A dark, glassmorphism **command deck**: an 8-agent mesh panel with live status,
a tactical map (radar sweep, severity heat glow, animated dispatch routes, click
to inspect), a **streaming AI reasoning timeline**, live stat counters,
interactive charts (Recharts), toast notifications, and **timeline replay** —
scrub back through the whole incident history. Built for a big screen in an
operations center. Respects `prefers-reduced-motion`.

Production wiring: swap the canvas tactical view for Mapbox GL with a
severity-weighted heatmap layer via `frontend/lib/mapbox.ts`.

---

## Deploy

1. `terraform -chdir=terraform apply` → VPC, EKS, RDS(PostGIS), Redis.
2. Enable PostGIS on RDS, load `backend/app/db/schema.sql`.
3. `kubectl apply -f k8s/` → API (3 replicas + HPA to 20), ingress with
   long-timeout WebSocket support.
4. Point images at your registry (CI publishes to GHCR on `main`).

For >1 API replica, back the WebSocket fan-out with Redis pub/sub — the
`manager.broadcast()` signature is unchanged.

---

## Security notes
- Passwords hashed with bcrypt; JWTs signed HS256 (rotate `NEXUS_JWT_SECRET`,
  or move to RS256 + JWKS for multi-service).
- RBAC enforced server-side on every mutating route.
- Secrets via env / k8s Secrets (use sealed-secrets or a cloud secret store —
  never commit real values).
- CORS locked to configured origins; PostGIS storage encrypted at rest (RDS).
- Non-root container user; health/readiness/liveness probes.

## Responsible use
Disaster response is life-critical. This platform is designed for
**human-in-the-loop decision support**: it ranks and routes, humans decide.
Model outputs must be validated on representative data before any real
deployment; misinformation scores and damage estimates are probabilistic and
can be wrong. Keep an audit trail (`audit_logs`), and never let an automated
score be the sole basis for withholding or directing aid.

## License
MIT — see `LICENSE`. Built as a reference implementation.
