# NEXUS AI — Architecture

## System overview

```mermaid
flowchart TB
    subgraph Clients
      C1["Citizen / Volunteer<br/>web + mobile"]
      C2["NGO / Government<br/>command dashboard"]
    end

    subgraph Edge["Frontend — Next.js 15 / React 19"]
      UI["Glassmorphism Command UI<br/>Mapbox · Framer Motion · Recharts"]
      WSC["WebSocket client<br/>live timeline + notifications"]
    end

    subgraph API["Backend — FastAPI"]
      GW["REST /api/v1<br/>JWT + RBAC"]
      WSS["WebSocket /ws<br/>pub/sub"]
      ORCH["Agent Orchestrator<br/>DAG scheduler"]
    end

    subgraph Mesh["8-Agent Mesh (LangGraph / CrewAI compatible)"]
      A1["ORBITAL — satellite"]
      A2["AERIAL — drone"]
      A3["SIGNAL — Whisper"]
      A5["LINGUA — translate"]
      A6["VERITAS — misinformation"]
      A4["TRIAGE — urgency"]
      A7["ORACLE — forecast"]
      A8["VECTOR — routing"]
    end

    subgraph Models["Model layer (pluggable)"]
      M1["GPT-5.5 / LLM"]
      M2["Whisper"]
      M3["YOLOv8 + SAM"]
    end

    subgraph Data["Datastores"]
      PG[("PostgreSQL + PostGIS")]
      RD[("Redis<br/>cache + pub/sub")]
      KF[["Kafka<br/>ingest stream"]]
    end

    C1 & C2 --> UI --> GW
    UI <--> WSC <--> WSS
    GW --> ORCH --> Mesh
    Mesh --> Models
    A3 --> A5 --> A6 --> A4
    A1 & A2 --> A4 --> A7 --> A8
    GW --> PG
    WSS <--> RD
    KF --> GW
    ORCH -. streams steps .-> WSS
```

## Request lifecycle — creating an incident

```mermaid
sequenceDiagram
    participant U as Volunteer
    participant API as FastAPI
    participant O as Orchestrator
    participant M as Agent Mesh
    participant DB as PostGIS
    participant WS as Dashboards

    U->>API: POST /incidents (JWT)
    API->>DB: INSERT incident (status=assessing)
    API-->>WS: broadcast incident.created
    API->>O: run(incident)
    loop each DAG stage (parallel within stage)
        O->>M: run agents
        M-->>O: AgentResult
        O-->>API: on_step(result)
        API->>DB: INSERT agent_run
        API-->>WS: broadcast agent.step
    end
    API->>DB: nearest available ambulance (KNN)
    API->>DB: INSERT dispatch, status=dispatched
    API-->>WS: broadcast dispatch.created
    API-->>U: 201 IncidentOut
```

## Agent dependency DAG

```mermaid
flowchart LR
    ORBITAL --> TRIAGE
    AERIAL --> TRIAGE
    SIGNAL --> LINGUA --> VERITAS
    SIGNAL --> TRIAGE
    LINGUA --> TRIAGE
    TRIAGE --> ORACLE --> VECTOR
```

Perception (ORBITAL, AERIAL) and intake (SIGNAL→LINGUA→VERITAS) run
concurrently; TRIAGE fuses them; ORACLE forecasts demand; VECTOR routes.
The scheduler groups agents into stages so each stage runs in parallel.

## Scaling notes
- **Stateless API** replicas behind a load balancer; sticky sessions not
  required (JWT). WebSocket fan-out moves to Redis pub/sub for >1 replica.
- **Kafka** decouples high-volume ingest (calls, sensors, social) from the
  synchronous request path; a consumer feeds the orchestrator.
- **PostGIS** GiST indexes serve radius and KNN (`<->`) queries for nearest
  resource selection.
- **Models** scale independently — GPU pods for YOLO/SAM, hosted API for LLM.
