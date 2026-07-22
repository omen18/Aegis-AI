-- ============================================================================
-- NEXUS AI — physical schema (PostgreSQL 16 + PostGIS 3.4)
-- Normalized to 3NF. Geospatial columns use GEOGRAPHY(POINT,4326) with GiST
-- indexes for radius / nearest-neighbour queries (KNN via <->).
-- The ORM (app/models.py) mirrors this with lat/lon floats for portability;
-- run THIS file for production-grade spatial capability.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---- enums --------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE user_role      AS ENUM ('citizen','volunteer','ngo','government','admin');
  CREATE TYPE incident_status AS ENUM ('reported','assessing','dispatched','resolved');
  CREATE TYPE resource_kind  AS ENUM ('ambulance','rescue_team','boat','medical');
  CREATE TYPE resource_status AS ENUM ('available','dispatched','enroute','arrived');
  CREATE TYPE report_source  AS ENUM ('call','social','sensor');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---- users --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255),                       -- NULL => OAuth-only
    full_name       VARCHAR(120) NOT NULL,
    role            user_role NOT NULL DEFAULT 'citizen',
    google_sub      VARCHAR(64) UNIQUE,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_users_role ON users(role);

-- ---- incidents ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS incidents (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code             VARCHAR(24) UNIQUE NOT NULL,
    type             VARCHAR(32) NOT NULL,
    severity         SMALLINT NOT NULL DEFAULT 0 CHECK (severity BETWEEN 0 AND 3),
    status           incident_status NOT NULL DEFAULT 'reported',
    description      TEXT,
    zone             VARCHAR(64),
    geom             GEOGRAPHY(POINT, 4326) NOT NULL,
    people_affected  INTEGER NOT NULL DEFAULT 0 CHECK (people_affected >= 0),
    verified         BOOLEAN NOT NULL DEFAULT FALSE,
    reported_by      UUID REFERENCES users(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_incidents_geom   ON incidents USING GIST (geom);
CREATE INDEX IF NOT EXISTS ix_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS ix_incidents_type   ON incidents(type);
CREATE INDEX IF NOT EXISTS ix_incidents_created ON incidents(created_at DESC);

-- ---- agent_runs ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_runs (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    incident_id  UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    agent_key    VARCHAR(24) NOT NULL,
    status       VARCHAR(16) NOT NULL DEFAULT 'queued',
    confidence   REAL,
    latency_ms   INTEGER,
    output       JSONB,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_agent_runs_incident ON agent_runs(incident_id);
CREATE INDEX IF NOT EXISTS ix_agent_runs_key      ON agent_runs(agent_key);

-- ---- resources ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS resources (
    id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    kind      resource_kind NOT NULL,
    callsign  VARCHAR(24) UNIQUE NOT NULL,
    status    resource_status NOT NULL DEFAULT 'available',
    geom      GEOGRAPHY(POINT, 4326) NOT NULL,
    capacity  INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS ix_resources_geom   ON resources USING GIST (geom);
CREATE INDEX IF NOT EXISTS ix_resources_status ON resources(status);

-- ---- dispatches ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS dispatches (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    incident_id  UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    resource_id  UUID NOT NULL REFERENCES resources(id),
    eta_min      INTEGER NOT NULL,
    distance_km  REAL NOT NULL,
    route        JSONB,                                 -- GeoJSON LineString
    status       VARCHAR(16) NOT NULL DEFAULT 'assigned',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_dispatches_incident ON dispatches(incident_id);
CREATE INDEX IF NOT EXISTS ix_dispatches_resource ON dispatches(resource_id);

-- ---- reports (calls / social / sensor) ----------------------------------
CREATE TABLE IF NOT EXISTS reports (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    incident_id      UUID REFERENCES incidents(id),
    source           report_source NOT NULL,
    raw_text         TEXT,
    language         VARCHAR(12),
    translated_text  TEXT,
    authenticity     REAL CHECK (authenticity BETWEEN 0 AND 1),
    reported_by      UUID REFERENCES users(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_reports_incident ON reports(incident_id);
CREATE INDEX IF NOT EXISTS ix_reports_source   ON reports(source);

-- ---- notifications ------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    target_role  user_role,
    user_id      UUID REFERENCES users(id),
    incident_id  UUID REFERENCES incidents(id),
    level        VARCHAR(12) NOT NULL DEFAULT 'info',
    message      TEXT NOT NULL,
    read         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS ix_notifications_role ON notifications(target_role);

-- ---- audit_logs ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID REFERENCES users(id),
    action     VARCHAR(48) NOT NULL,
    entity     VARCHAR(32) NOT NULL,
    entity_id  VARCHAR(48),
    meta       JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- example spatial query: nearest available ambulance to an incident --
-- SELECT r.callsign, ST_Distance(r.geom, i.geom) AS metres
-- FROM resources r, incidents i
-- WHERE i.code = 'INC-12345' AND r.kind='ambulance' AND r.status='available'
-- ORDER BY r.geom <-> i.geom LIMIT 1;
