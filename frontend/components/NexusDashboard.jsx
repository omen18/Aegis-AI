"use client";
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Satellite, Plane, Radio, Gauge, Languages, ShieldAlert, BrainCircuit, Route,
  Bell, Play, Pause, SkipBack, MapPin, Activity, AlertTriangle, Zap, Users,
  Clock, Waves, Flame, Building2, Wind, Signal, Radar, ChevronDown, X, Cpu,
} from "lucide-react";
import {
  BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";

/* ------------------------------------------------------------------ *
 *  NEXUS AI — Autonomous Disaster Response Command
 *  Self-contained situational-awareness surface.
 *  Live simulation drives an 8-agent pipeline, a tactical map, a
 *  streaming reasoning log, live stats, charts and timeline replay.
 * ------------------------------------------------------------------ */

const AGENTS = [
  { id: "orbital", name: "ORBITAL",  role: "Satellite damage assessment",  icon: Satellite,   color: "#38BDF8" },
  { id: "aerial",  name: "AERIAL",   role: "Drone footage analysis",       icon: Plane,       color: "#22D3EE" },
  { id: "signal",  name: "SIGNAL",   role: "Emergency call transcription", icon: Radio,       color: "#2DD4BF" },
  { id: "triage",  name: "TRIAGE",   role: "Urgency scoring",              icon: Gauge,       color: "#FBBF24" },
  { id: "lingua",  name: "LINGUA",   role: "Real-time translation",        icon: Languages,   color: "#A78BFA" },
  { id: "veritas", name: "VERITAS",  role: "Misinformation detection",     icon: ShieldAlert, color: "#F472B6" },
  { id: "oracle",  name: "ORACLE",   role: "Rescue demand forecasting",    icon: BrainCircuit,color: "#34D399" },
  { id: "vector",  name: "VECTOR",   role: "Ambulance route optimization", icon: Route,       color: "#FB923C" },
];

const INCIDENT_TYPES = [
  { key: "collapse", label: "Building Collapse", icon: Building2, weight: 3 },
  { key: "flood",    label: "Flooding",          icon: Waves,     weight: 4 },
  { key: "fire",     label: "Structure Fire",    icon: Flame,     weight: 3 },
  { key: "medical",  label: "Mass Casualty",     icon: AlertTriangle, weight: 3 },
  { key: "gas",      label: "Gas Leak",          icon: Wind,      weight: 2 },
  { key: "trapped",  label: "Trapped Persons",   icon: Users,     weight: 3 },
  { key: "power",    label: "Power Failure",     icon: Zap,       weight: 2 },
];

// severity 0..3 -> config
const SEV = [
  { label: "LOW",      color: "#34D399", ring: "rgba(52,211,153,0.9)" },
  { label: "MODERATE", color: "#FBBF24", ring: "rgba(251,191,36,0.9)" },
  { label: "HIGH",     color: "#FB923C", ring: "rgba(251,146,60,0.9)" },
  { label: "CRITICAL", color: "#F43F5E", ring: "rgba(244,63,94,0.95)" },
];

const REGIONS = ["Coastal District — Sector 7", "Metro Basin — Sector 3", "Riverside Grid — Sector 12"];
const LANGS = ["hi-IN", "bn-IN", "ta-IN", "mr-IN", "te-IN", "es-ES", "ar-SA", "fr-FR"];
const ZONES = [
  { name: "Old Harbour", x: 0.22, y: 0.30 },
  { name: "Civic Core",  x: 0.55, y: 0.42 },
  { name: "Marsh End",   x: 0.74, y: 0.66 },
  { name: "North Ridge", x: 0.40, y: 0.72 },
  { name: "Dockside",    x: 0.80, y: 0.24 },
];
const BASE = { x: 0.50, y: 0.90 }; // dispatch base for routes

const rnd = (a, b) => a + Math.random() * (b - a);
const rndi = (a, b) => Math.floor(rnd(a, b + 1));
const pick = (arr) => arr[rndi(0, arr.length - 1)];
const pad2 = (n) => String(n).padStart(2, "0");
const fmtClock = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;

let SEQ = 1000;

function makeIncident(tNow) {
  const type = (() => {
    const pool = INCIDENT_TYPES.flatMap((t) => Array(t.weight).fill(t));
    return pick(pool);
  })();
  const zone = pick(ZONES);
  const sev = Math.min(3, Math.max(0, Math.round(rnd(-0.2, 3.2))));
  const people = rndi(2, 40) * (sev + 1);
  const id = ++SEQ;
  return {
    id,
    code: `INC-${id}`,
    type: type.key,
    typeLabel: type.label,
    sev,
    people,
    zone: zone.name,
    x: Math.min(0.95, Math.max(0.05, zone.x + rnd(-0.08, 0.08))),
    y: Math.min(0.95, Math.max(0.05, zone.y + rnd(-0.08, 0.08))),
    lang: pick(LANGS),
    t0: tNow,
    ttl: rnd(26000, 60000) * (4 - sev) * 0.4 + 18000, // criticals linger longer
    dispatched: false,
    etaMin: rndi(4, 16),
  };
}

const CALL_SNIPPETS = [
  "…pura building gir gaya hai, log andar phase hue hain…",
  "…water rising fast, ground floor submerged, need boats…",
  "…smoke everywhere, cannot find the exit, third floor…",
  "…road blocked, ambulance nahi aa paa rahi, bahut khoon…",
  "…gas ki smell aa rahi hai, poora block khaali karo…",
];

// One reasoning line for a given agent + incident
function reason(agentId, inc) {
  const s = (SEV[inc.sev] || SEV[0]).label;
  switch (agentId) {
    case "orbital": return `Sentinel-2 tile ${inc.zone} · CNN damage mask → ${rndi(3, 18)} structures flagged (conf ${rndi(82, 98)}%)`;
    case "aerial":  return `UAV feed segmented (SAM) · ${rndi(1, 9)} collapsed roofs, ${rndi(0, 4)} blocked routes`;
    case "signal":  return `Whisper ↯ "${pick(CALL_SNIPPETS)}" · lang=${inc.lang}`;
    case "triage":  return `SeverityNet ${rndi(inc.sev * 22, inc.sev * 25 + 12)}/100 → ${s} · ~${inc.people} persons at risk`;
    case "lingua":  return `Translated ${inc.lang}→EN · intent=rescue_request, sentiment=distress`;
    case "veritas": return `Cross-checked vs ${rndi(3, 9)} sources · authenticity ${rndi(58, 99)}% (${Math.random() > 0.22 ? "verified" : "flagged"})`;
    case "oracle":  return `Demand forecast → route Team ${pick(["A", "B", "C", "D", "E"])}${rndi(1, 6)} to ${inc.zone} (ETA ${inc.etaMin}m)`;
    case "vector":  return `A* solved · ${rnd(1.2, 7.8).toFixed(1)} km, ${inc.etaMin}m, avoiding ${rndi(0, 3)} blockage(s)`;
    default: return "…";
  }
}

// severity/type -> which agents fire (pipeline)
function pipelineFor(inc) {
  const chain = ["signal", "lingua", "veritas", "triage"];
  if (inc.type === "collapse" || inc.type === "fire" || inc.type === "trapped") chain.unshift("aerial");
  if (inc.type === "collapse" || inc.type === "flood") chain.unshift("orbital");
  chain.push("oracle", "vector");
  return chain;
}

export default function NexusDashboard() {
  const startRef = useRef(Date.now());
  const [now, setNow] = useState(Date.now());
  const [history, setHistory] = useState([]);      // reasoning log events {t, agentId, incId, text}
  const [incidents, setIncidents] = useState([]);  // all incidents ever
  const [agentState, setAgentState] = useState(() =>
    Object.fromEntries(AGENTS.map((a) => [a.id, { status: "idle", count: 0, last: 0 }]))
  );
  const [notifs, setNotifs] = useState([]);
  const [region, setRegion] = useState(REGIONS[0]);
  const [regionOpen, setRegionOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [live, setLive] = useState(true);
  const [replayT, setReplayT] = useState(0); // ms offset from start when scrubbing

  // ---- master clock ----
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const elapsed = now - startRef.current;
  const viewT = live ? elapsed : replayT;

  // ---- simulation loop (only when live) ----
  const incidentsRef = useRef(incidents);
  incidentsRef.current = incidents;

  useEffect(() => {
    if (!live) return;
    let timers = [];
    const spawn = () => {
      const t = Date.now() - startRef.current;
      const inc = makeIncident(t);
      setIncidents((prev) => [...prev, inc]);
      setNotifs((prev) => [{ id: inc.id, inc, born: Date.now() }, ...prev].slice(0, 4));

      // run its agent pipeline with staggered timing
      const chain = pipelineFor(inc);
      chain.forEach((agentId, i) => {
        const delay = 350 + i * rnd(500, 1100);
        const tm = setTimeout(() => {
          const tt = Date.now() - startRef.current;
          setHistory((h) => [...h, { t: tt, agentId, incId: inc.id, code: inc.code, text: reason(agentId, inc) }].slice(-260));
          setAgentState((s) => ({ ...s, [agentId]: { status: "active", count: s[agentId].count + 1, last: Date.now() } }));
          if (agentId === "vector") setIncidents((prev) => prev.map((p) => (p.id === inc.id ? { ...p, dispatched: true } : p)));
          const tm2 = setTimeout(() => setAgentState((s) => ({ ...s, [agentId]: { ...s[agentId], status: "idle" } })), 1400);
          timers.push(tm2);
        }, delay);
        timers.push(tm);
      });
    };

    spawn();
    const loop = setInterval(spawn, rnd(3600, 5200));
    return () => { clearInterval(loop); timers.forEach(clearTimeout); };
  }, [live]);

  // dismiss stale notifications
  useEffect(() => {
    const id = setInterval(() => {
      setNotifs((prev) => prev.filter((n) => Date.now() - n.born < 6000));
    }, 800);
    return () => clearInterval(id);
  }, []);

  // ---- derived view state (respects live vs replay) ----
  const activeIncidents = useMemo(
    () => incidents.filter((i) => i.t0 <= viewT && viewT - i.t0 < i.ttl),
    [incidents, viewT]
  );
  const visibleLog = useMemo(
    () => history.filter((e) => e.t <= viewT).slice(-120).reverse(),
    [history, viewT]
  );

  const stats = useMemo(() => {
    const affected = activeIncidents.reduce((a, i) => a + i.people, 0);
    const deployed = activeIncidents.filter((i) => i.dispatched && i.t0 <= viewT).length;
    const crit = activeIncidents.filter((i) => i.sev === 3).length;
    const avgEta = activeIncidents.length
      ? Math.round(activeIncidents.reduce((a, i) => a + i.etaMin, 0) / activeIncidents.length)
      : 0;
    return { active: activeIncidents.length, affected, deployed, crit, avgEta };
  }, [activeIncidents, viewT]);

  // charts
  const typeData = useMemo(() => {
    const m = {};
    activeIncidents.forEach((i) => { m[i.typeLabel] = (m[i.typeLabel] || 0) + 1; });
    return INCIDENT_TYPES.map((t) => ({ name: t.label.split(" ")[0], v: m[t.label] || 0 }));
  }, [activeIncidents]);

  const sevData = useMemo(() => {
    const c = [0, 0, 0, 0];
    activeIncidents.forEach((i) => c[i.sev]++);
    return SEV.map((s, i) => ({ name: s.label, value: c[i], color: s.color }));
  }, [activeIncidents]);

  const etaSeries = useMemo(() => {
    // build a rolling series bucketed per ~4s of elapsed time up to viewT
    const buckets = 24;
    const span = Math.max(viewT, 24000);
    const step = span / buckets;
    return Array.from({ length: buckets }, (_, k) => {
      const lo = k * step, hi = (k + 1) * step;
      const inWin = incidents.filter((i) => i.t0 >= lo && i.t0 < hi && i.t0 <= viewT);
      const eta = inWin.length ? Math.round(inWin.reduce((a, i) => a + i.etaMin, 0) / inWin.length) : null;
      return { t: k, eta: eta ?? undefined, calls: inWin.length };
    });
  }, [incidents, viewT]);

  const totalEver = incidents.filter((i) => i.t0 <= viewT).length;

  // ---- canvas map ----
  const canvasRef = useRef(null);
  const stateRef = useRef({ activeIncidents, selected });
  stateRef.current = { activeIncidents, selected, viewT };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let raf; let t0 = performance.now();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = r.width * dpr;
      canvas.height = r.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = (ts) => {
      const r = canvas.getBoundingClientRect();
      const W = r.width, H = r.height;
      const t = (ts - t0) / 1000;
      const { activeIncidents: inc, selected: sel, viewT: vt } = stateRef.current;
      ctx.clearRect(0, 0, W, H);

      // backdrop gradient
      const g = ctx.createRadialGradient(W * 0.5, H * 0.55, 30, W * 0.5, H * 0.55, Math.max(W, H) * 0.8);
      g.addColorStop(0, "rgba(20,30,52,0.55)");
      g.addColorStop(1, "rgba(6,10,20,0.0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      // grid
      ctx.strokeStyle = "rgba(56,189,248,0.06)"; ctx.lineWidth = 1;
      const gs = 44;
      for (let x = 0; x <= W; x += gs) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y <= H; y += gs) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

      // faux coastline / river
      ctx.strokeStyle = "rgba(45,212,191,0.16)"; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, H * 0.18);
      ctx.bezierCurveTo(W * 0.3, H * 0.1, W * 0.5, H * 0.32, W, H * 0.22);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(W * 0.15, H);
      ctx.bezierCurveTo(W * 0.35, H * 0.7, W * 0.45, H * 0.6, W * 0.62, H * 0.28);
      ctx.stroke();

      // zone labels
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillStyle = "rgba(148,163,184,0.55)";
      ZONES.forEach((z) => { ctx.fillText(z.name.toUpperCase(), z.x * W + 8, z.y * H - 8); });

      // heat glow
      inc.forEach((i) => {
        const s = SEV[i.sev];
        const px = i.x * W, py = i.y * H;
        const rad = 46 + i.sev * 26 + (i.people > 60 ? 26 : 0);
        const hg = ctx.createRadialGradient(px, py, 4, px, py, rad);
        hg.addColorStop(0, s.color + "44");
        hg.addColorStop(1, s.color + "00");
        ctx.fillStyle = hg;
        ctx.beginPath(); ctx.arc(px, py, rad, 0, Math.PI * 2); ctx.fill();
      });

      // dispatch routes (animated dashes)
      inc.filter((i) => i.dispatched).forEach((i) => {
        const px = i.x * W, py = i.y * H;
        const bx = BASE.x * W, by = BASE.y * H;
        ctx.save();
        ctx.setLineDash([7, 9]);
        ctx.lineDashOffset = reduce ? 0 : -((t * 42) % 400);
        ctx.strokeStyle = "rgba(251,146,60,0.85)";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        const mx = (bx + px) / 2 + (py - by) * 0.12;
        const my = (by + py) / 2 - (px - bx) * 0.12;
        ctx.quadraticCurveTo(mx, my, px, py);
        ctx.stroke();
        ctx.restore();
      });

      // radar sweep
      if (!reduce) {
        const cx = W * 0.5, cy = H * 0.55;
        const ang = (t * 0.6) % (Math.PI * 2);
        const sweep = ctx.createConicGradient ? ctx.createConicGradient(ang, cx, cy) : null;
        if (sweep) {
          sweep.addColorStop(0, "rgba(56,189,248,0.16)");
          sweep.addColorStop(0.06, "rgba(56,189,248,0.0)");
          sweep.addColorStop(1, "rgba(56,189,248,0.0)");
          ctx.fillStyle = sweep;
          ctx.beginPath(); ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, Math.max(W, H), 0, Math.PI * 2); ctx.fill();
        }
      }

      // incident markers + pulses
      inc.forEach((i) => {
        const s = SEV[i.sev];
        const px = i.x * W, py = i.y * H;
        const age = (vt - i.t0) / 1000;
        if (!reduce) {
          const p = (age % 2) / 2;
          ctx.strokeStyle = s.ring.replace(/[\d.]+\)$/, (1 - p) * 0.7 + ")");
          ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.arc(px, py, 8 + p * 26, 0, Math.PI * 2); ctx.stroke();
        }
        // core
        ctx.fillStyle = s.color;
        ctx.shadowColor = s.color; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.arc(px, py, sel && sel.id === i.id ? 7 : 5, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        if (sel && sel.id === i.id) {
          ctx.strokeStyle = "#E2E8F0"; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(px, py, 13, 0, Math.PI * 2); ctx.stroke();
        }
      });

      // base
      const bx = BASE.x * W, by = BASE.y * H;
      ctx.fillStyle = "rgba(56,189,248,0.95)";
      ctx.beginPath(); ctx.moveTo(bx, by - 7); ctx.lineTo(bx + 6, by + 5); ctx.lineTo(bx - 6, by + 5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(148,163,184,0.7)"; ctx.font = "9px ui-monospace, monospace";
      ctx.fillText("DISPATCH BASE", bx + 10, by + 4);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  // click on canvas -> select nearest incident
  const onCanvasClick = useCallback((e) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    const mx = (e.clientX - r.left) / r.width, my = (e.clientY - r.top) / r.height;
    let best = null, bd = 0.05;
    stateRef.current.activeIncidents.forEach((i) => {
      const d = Math.hypot(i.x - mx, i.y - my);
      if (d < bd) { bd = d; best = i; }
    });
    setSelected(best);
  }, []);

  const logEndRef = useRef(null);
  const agentMap = Object.fromEntries(AGENTS.map((a) => [a.id, a]));

  return (
    <div className="nx-root">
      <style>{CSS}</style>

      {/* ===== TOP COMMAND BAR ===== */}
      <header className="nx-topbar glass">
        <div className="nx-brand">
          <div className="nx-logo"><Radar size={18} /></div>
          <div>
            <div className="nx-title">NEXUS <span>AI</span></div>
            <div className="nx-sub">Autonomous Disaster Response Command</div>
          </div>
        </div>

        <div className="nx-region" onClick={() => setRegionOpen((o) => !o)}>
          <MapPin size={13} />
          <span>{region}</span>
          <ChevronDown size={13} className={regionOpen ? "rot" : ""} />
          {regionOpen && (
            <div className="nx-dropdown glass" onClick={(e) => e.stopPropagation()}>
              {REGIONS.map((r) => (
                <div key={r} className={"nx-dd-item" + (r === region ? " on" : "")}
                     onClick={() => { setRegion(r); setRegionOpen(false); }}>{r}</div>
              ))}
            </div>
          )}
        </div>

        <div className="nx-top-right">
          <div className="nx-pill danger"><span className="dot" /> {stats.crit} CRITICAL</div>
          <div className={"nx-pill" + (live ? " live" : " replay")}>
            <span className="dot" /> {live ? "LIVE" : "REPLAY"}
          </div>
          <div className="nx-clock"><Clock size={13} /> {fmtClock(new Date(now))}</div>
          <div className="nx-status"><Signal size={13} /> ALL SYSTEMS NOMINAL</div>
        </div>
      </header>

      {/* ===== MAIN GRID ===== */}
      <div className="nx-grid">
        {/* LEFT: agents */}
        <aside className="nx-col nx-agents glass">
          <div className="nx-col-head"><Cpu size={13} /> AGENT MESH <span className="nx-count">8 ONLINE</span></div>
          <div className="nx-agent-list">
            {AGENTS.map((a) => {
              const st = agentState[a.id];
              const Icon = a.icon;
              return (
                <div key={a.id} className={"nx-agent" + (st.status === "active" ? " active" : "")}>
                  <div className="nx-agent-ic" style={{ color: a.color, borderColor: a.color + "55", background: a.color + "12" }}>
                    <Icon size={15} />
                    {st.status === "active" && <span className="nx-agent-pulse" style={{ background: a.color }} />}
                  </div>
                  <div className="nx-agent-body">
                    <div className="nx-agent-top">
                      <span className="nx-agent-name">{a.name}</span>
                      <span className={"nx-agent-dot " + st.status} style={st.status === "active" ? { background: a.color, boxShadow: `0 0 8px ${a.color}` } : {}} />
                    </div>
                    <div className="nx-agent-role">{a.role}</div>
                    <div className="nx-agent-meta">
                      <span>{st.status === "active" ? "PROCESSING" : "STANDBY"}</span>
                      <span className="mono">{st.count} ops</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* CENTER: map + stats + replay */}
        <main className="nx-col nx-center">
          <div className="nx-map glass">
            <div className="nx-map-head">
              <span><Radar size={12} /> TACTICAL OVERVIEW</span>
              <span className="nx-legend">
                {SEV.map((s) => <i key={s.label} style={{ color: s.color }}>● {s.label}</i>)}
              </span>
            </div>
            <canvas ref={canvasRef} className="nx-canvas" onClick={onCanvasClick} />
            <div className="nx-scan" />
            {/* notifications overlay */}
            <div className="nx-notifs">
              {notifs.map((n) => {
                const s = SEV[n.inc.sev];
                return (
                  <div key={n.id} className="nx-notif glass" style={{ borderLeftColor: s.color }}>
                    <AlertTriangle size={14} style={{ color: s.color }} />
                    <div>
                      <div className="nx-notif-t">{n.inc.typeLabel} · <span style={{ color: s.color }}>{s.label}</span></div>
                      <div className="nx-notif-s mono">{n.inc.code} · {n.inc.zone} · ~{n.inc.people} affected</div>
                    </div>
                  </div>
                );
              })}
            </div>
            {selected && (
              <div className="nx-inspect glass">
                <button className="nx-inspect-x" onClick={() => setSelected(null)}><X size={13} /></button>
                <div className="nx-inspect-h" style={{ color: SEV[selected.sev].color }}>{selected.typeLabel}</div>
                <div className="nx-inspect-row"><span>ID</span><b className="mono">{selected.code}</b></div>
                <div className="nx-inspect-row"><span>Severity</span><b style={{ color: SEV[selected.sev].color }}>{SEV[selected.sev].label}</b></div>
                <div className="nx-inspect-row"><span>Zone</span><b>{selected.zone}</b></div>
                <div className="nx-inspect-row"><span>At risk</span><b className="mono">~{selected.people}</b></div>
                <div className="nx-inspect-row"><span>Call lang</span><b className="mono">{selected.lang}</b></div>
                <div className="nx-inspect-row"><span>Status</span><b style={{ color: selected.dispatched ? "#34D399" : "#FBBF24" }}>{selected.dispatched ? "DISPATCHED" : "ASSESSING"}</b></div>
              </div>
            )}
          </div>

          {/* stat strip */}
          <div className="nx-stats">
            <Stat icon={AlertTriangle} label="Active incidents" value={stats.active} color="#38BDF8" />
            <Stat icon={Users} label="People affected" value={stats.affected.toLocaleString()} color="#F472B6" />
            <Stat icon={Route} label="Teams deployed" value={stats.deployed} color="#FB923C" />
            <Stat icon={Clock} label="Avg ETA (min)" value={stats.avgEta} color="#34D399" />
          </div>

          {/* replay */}
          <div className="nx-replay glass">
            <button className="nx-rbtn" onClick={() => { setReplayT(0); setLive(false); }} title="Restart replay"><SkipBack size={15} /></button>
            <button className="nx-rbtn primary" onClick={() => setLive((l) => !l)}>
              {live ? <Pause size={15} /> : <Play size={15} />} {live ? "PAUSE / REPLAY" : "GO LIVE"}
            </button>
            <input
              type="range" min={0} max={Math.max(elapsed, 1000)} value={viewT}
              onChange={(e) => { setLive(false); setReplayT(Number(e.target.value)); }}
              className="nx-slider"
            />
            <span className="nx-time mono">T+{pad2(Math.floor(viewT / 60000))}:{pad2(Math.floor((viewT % 60000) / 1000))}</span>
          </div>
        </main>

        {/* RIGHT: reasoning timeline */}
        <aside className="nx-col nx-timeline glass">
          <div className="nx-col-head"><Activity size={13} /> AI REASONING TIMELINE <span className="nx-live-dot" /></div>
          <div className="nx-log">
            {visibleLog.length === 0 && <div className="nx-log-empty">Awaiting telemetry…</div>}
            {visibleLog.map((e, idx) => {
              const a = agentMap[e.agentId];
              return (
                <div className="nx-log-row" key={e.t + "-" + idx} style={{ animationDelay: idx < 4 ? `${idx * 40}ms` : "0ms" }}>
                  <div className="nx-log-rail" style={{ background: a.color }} />
                  <div className="nx-log-body">
                    <div className="nx-log-top">
                      <span className="nx-log-agent" style={{ color: a.color }}>{a.name}</span>
                      <span className="nx-log-code mono">{e.code}</span>
                      <span className="nx-log-t mono">+{(e.t / 1000).toFixed(1)}s</span>
                    </div>
                    <div className="nx-log-text">{e.text}</div>
                  </div>
                </div>
              );
            })}
            <div ref={logEndRef} />
          </div>
        </aside>
      </div>

      {/* ===== CHARTS ROW ===== */}
      <div className="nx-charts">
        <ChartCard title="Incident types" sub="active by category">
          <ResponsiveContainer width="100%" height={130}>
            <BarChart data={typeData} margin={{ top: 6, right: 6, left: -22, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fill: "#64748B", fontSize: 9 }} axisLine={false} tickLine={false} interval={0} />
              <YAxis tick={{ fill: "#64748B", fontSize: 9 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={TT} cursor={{ fill: "rgba(56,189,248,0.08)" }} />
              <Bar dataKey="v" radius={[3, 3, 0, 0]} fill="#38BDF8" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Severity mix" sub="live distribution">
          <ResponsiveContainer width="100%" height={130}>
            <PieChart>
              <Pie data={sevData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={30} outerRadius={52} paddingAngle={3} stroke="none">
                {sevData.map((d) => <Cell key={d.name} fill={d.color} />)}
              </Pie>
              <Tooltip contentStyle={TT} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Response time" sub="avg ETA trend (min)">
          <ResponsiveContainer width="100%" height={130}>
            <AreaChart data={etaSeries} margin={{ top: 6, right: 6, left: -22, bottom: 0 }}>
              <defs>
                <linearGradient id="etaG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34D399" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#34D399" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="t" hide />
              <YAxis tick={{ fill: "#64748B", fontSize: 9 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TT} />
              <Area type="monotone" dataKey="eta" stroke="#34D399" strokeWidth={2} fill="url(#etaG)" connectNulls dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Call volume" sub="intake per interval">
          <ResponsiveContainer width="100%" height={130}>
            <LineChart data={etaSeries} margin={{ top: 6, right: 6, left: -22, bottom: 0 }}>
              <XAxis dataKey="t" hide />
              <YAxis tick={{ fill: "#64748B", fontSize: 9 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip contentStyle={TT} />
              <Line type="monotone" dataKey="calls" stroke="#F472B6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <footer className="nx-foot mono">
        NEXUS AI · {totalEver} incidents processed · 8-agent LangGraph mesh · demo simulation — model layer is pluggable (GPT / Whisper / YOLO / SAM)
      </footer>
    </div>
  );
}

function Stat({ icon: Icon, label, value, color }) {
  return (
    <div className="nx-stat glass">
      <div className="nx-stat-ic" style={{ color, background: color + "12", borderColor: color + "33" }}><Icon size={16} /></div>
      <div>
        <div className="nx-stat-val mono">{value}</div>
        <div className="nx-stat-lbl">{label}</div>
      </div>
    </div>
  );
}

function ChartCard({ title, sub, children }) {
  return (
    <div className="nx-chart glass">
      <div className="nx-chart-head">
        <span className="nx-chart-title">{title}</span>
        <span className="nx-chart-sub">{sub}</span>
      </div>
      {children}
    </div>
  );
}

const TT = {
  background: "rgba(10,15,28,0.95)",
  border: "1px solid rgba(56,189,248,0.25)",
  borderRadius: 8,
  color: "#E2E8F0",
  fontSize: 11,
  fontFamily: "ui-monospace, monospace",
};

const CSS = `
:root{
  --bg:#070B14; --panel:rgba(17,24,39,0.55); --edge:rgba(56,189,248,0.14);
  --ink:#E2E8F0; --mut:#94A3B8; --dim:#64748B; --cyan:#38BDF8;
}
*{box-sizing:border-box;}
.nx-root{
  min-height:100vh; background:
    radial-gradient(1200px 600px at 15% -10%, rgba(56,189,248,0.10), transparent 60%),
    radial-gradient(1000px 700px at 100% 120%, rgba(45,212,191,0.08), transparent 55%),
    #070B14;
  color:var(--ink); padding:14px; display:flex; flex-direction:column; gap:12px;
  font-family:"Inter",ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  letter-spacing:0.01em;
}
.mono{font-family:ui-monospace,"JetBrains Mono","SF Mono",Menlo,monospace;}
.glass{
  background:var(--panel); border:1px solid var(--edge);
  border-radius:14px; backdrop-filter:blur(14px) saturate(140%);
  -webkit-backdrop-filter:blur(14px) saturate(140%);
  box-shadow:0 8px 40px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.04);
}

/* top bar */
.nx-topbar{display:flex; align-items:center; gap:18px; padding:10px 16px;}
.nx-brand{display:flex; align-items:center; gap:12px;}
.nx-logo{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;color:#07101f;
  background:linear-gradient(135deg,#38BDF8,#2DD4BF); box-shadow:0 0 22px rgba(56,189,248,0.5);}
.nx-title{font-weight:800; font-size:17px; letter-spacing:0.14em;}
.nx-title span{color:var(--cyan);}
.nx-sub{font-size:10px; color:var(--mut); letter-spacing:0.18em; text-transform:uppercase;}
.nx-region{position:relative; display:flex; align-items:center; gap:7px; margin-left:6px;
  font-size:12px; color:var(--ink); padding:7px 12px; border-radius:9px; cursor:pointer;
  background:rgba(255,255,255,0.03); border:1px solid var(--edge);}
.nx-region svg.rot{transform:rotate(180deg);}
.nx-dropdown{position:absolute; top:110%; left:0; min-width:230px; padding:6px; z-index:40;}
.nx-dd-item{padding:8px 10px; border-radius:7px; font-size:12px; color:var(--mut); cursor:pointer;}
.nx-dd-item:hover{background:rgba(56,189,248,0.1); color:var(--ink);}
.nx-dd-item.on{color:var(--cyan);}
.nx-top-right{margin-left:auto; display:flex; align-items:center; gap:10px;}
.nx-pill{display:flex; align-items:center; gap:6px; font-size:10.5px; font-weight:700; letter-spacing:0.08em;
  padding:6px 11px; border-radius:20px; border:1px solid var(--edge); color:var(--mut);}
.nx-pill .dot{width:7px;height:7px;border-radius:50%; background:currentColor;}
.nx-pill.live{color:#34D399; border-color:rgba(52,211,153,0.4);}
.nx-pill.live .dot{background:#34D399; box-shadow:0 0 8px #34D399; animation:blink 1.4s infinite;}
.nx-pill.replay{color:#A78BFA; border-color:rgba(167,139,250,0.4);}
.nx-pill.danger{color:#F43F5E; border-color:rgba(244,63,94,0.4);}
.nx-pill.danger .dot{animation:blink 1s infinite;}
.nx-clock,.nx-status{display:flex; align-items:center; gap:6px; font-size:11px; color:var(--mut);
  font-family:ui-monospace,monospace; padding:6px 11px; border-radius:8px; border:1px solid var(--edge);}
.nx-status{color:#34D399;}

/* grid layout */
.nx-grid{display:grid; grid-template-columns:250px 1fr 340px; gap:12px; min-height:0;}
.nx-col{padding:12px;}
.nx-col-head{display:flex; align-items:center; gap:8px; font-size:10.5px; font-weight:700;
  letter-spacing:0.12em; color:var(--mut); text-transform:uppercase; padding-bottom:10px;
  border-bottom:1px solid var(--edge); margin-bottom:10px;}
.nx-count,.nx-col-head .nx-count{margin-left:auto; color:#34D399; font-size:9.5px;}

/* agents */
.nx-agents{display:flex; flex-direction:column;}
.nx-agent-list{display:flex; flex-direction:column; gap:8px; overflow:auto;}
.nx-agent{display:flex; gap:10px; padding:9px; border-radius:10px; border:1px solid transparent;
  background:rgba(255,255,255,0.02); transition:all .25s;}
.nx-agent.active{border-color:var(--edge); background:rgba(56,189,248,0.05);}
.nx-agent-ic{position:relative; width:34px;height:34px; border-radius:9px; display:grid; place-items:center; border:1px solid;}
.nx-agent-pulse{position:absolute; inset:-4px; border-radius:12px; opacity:0.4; animation:ring 1.2s infinite;}
.nx-agent-body{flex:1; min-width:0;}
.nx-agent-top{display:flex; align-items:center; gap:8px;}
.nx-agent-name{font-size:12px; font-weight:700; letter-spacing:0.08em;}
.nx-agent-dot{width:7px;height:7px;border-radius:50%; margin-left:auto; background:var(--dim);}
.nx-agent-dot.active{animation:none;}
.nx-agent-role{font-size:10px; color:var(--mut); margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
.nx-agent-meta{display:flex; justify-content:space-between; margin-top:5px; font-size:9px; color:var(--dim); letter-spacing:0.06em;}

/* center */
.nx-center{background:transparent; border:none; box-shadow:none; padding:0; display:flex; flex-direction:column; gap:12px; min-width:0;}
.nx-map{position:relative; flex:1; min-height:340px; padding:0; overflow:hidden;}
.nx-map-head{position:absolute; top:0; left:0; right:0; z-index:5; display:flex; justify-content:space-between;
  align-items:center; padding:11px 14px; font-size:10px; letter-spacing:0.12em; color:var(--mut);
  text-transform:uppercase; background:linear-gradient(to bottom,rgba(7,11,20,0.85),transparent);}
.nx-map-head span{display:flex; align-items:center; gap:7px;}
.nx-legend{gap:12px;}
.nx-legend i{font-style:normal; font-size:9px; font-family:ui-monospace,monospace;}
.nx-canvas{width:100%; height:100%; display:block; cursor:crosshair;}
.nx-scan{position:absolute; inset:0; pointer-events:none; opacity:0.5;
  background:repeating-linear-gradient(to bottom, transparent 0 2px, rgba(0,0,0,0.14) 2px 3px);
  mix-blend-mode:overlay;}
.nx-notifs{position:absolute; top:44px; right:12px; z-index:8; display:flex; flex-direction:column; gap:8px; width:250px;}
.nx-notif{display:flex; gap:9px; align-items:flex-start; padding:9px 11px; border-left:3px solid;
  animation:slidein .35s ease; border-radius:9px;}
.nx-notif-t{font-size:11px; font-weight:600;}
.nx-notif-s{font-size:9.5px; color:var(--mut); margin-top:2px;}
.nx-inspect{position:absolute; bottom:12px; left:12px; z-index:8; width:210px; padding:12px; border-radius:11px;}
.nx-inspect-x{position:absolute; top:8px; right:8px; background:none; border:none; color:var(--mut); cursor:pointer;}
.nx-inspect-h{font-size:12px; font-weight:700; letter-spacing:0.06em; margin-bottom:8px;}
.nx-inspect-row{display:flex; justify-content:space-between; font-size:10.5px; padding:3px 0; color:var(--mut);}
.nx-inspect-row b{color:var(--ink); font-weight:600;}

/* stats */
.nx-stats{display:grid; grid-template-columns:repeat(4,1fr); gap:12px;}
.nx-stat{display:flex; align-items:center; gap:11px; padding:13px;}
.nx-stat-ic{width:38px;height:38px;border-radius:10px;display:grid;place-items:center;border:1px solid;}
.nx-stat-val{font-size:22px; font-weight:700; line-height:1;}
.nx-stat-lbl{font-size:9.5px; color:var(--mut); letter-spacing:0.06em; text-transform:uppercase; margin-top:4px;}

/* replay */
.nx-replay{display:flex; align-items:center; gap:12px; padding:10px 14px;}
.nx-rbtn{display:flex; align-items:center; gap:7px; background:rgba(255,255,255,0.04); border:1px solid var(--edge);
  color:var(--ink); padding:7px 12px; border-radius:8px; font-size:11px; font-weight:600; cursor:pointer; letter-spacing:0.06em;}
.nx-rbtn.primary{background:linear-gradient(135deg,rgba(56,189,248,0.22),rgba(45,212,191,0.18)); border-color:rgba(56,189,248,0.4);}
.nx-rbtn:hover{border-color:var(--cyan);}
.nx-slider{flex:1; accent-color:#38BDF8; height:4px;}
.nx-time{font-size:11px; color:var(--cyan); min-width:64px; text-align:right;}

/* timeline */
.nx-timeline{display:flex; flex-direction:column; min-height:0;}
.nx-live-dot{margin-left:auto; width:7px;height:7px;border-radius:50%; background:#34D399; box-shadow:0 0 8px #34D399; animation:blink 1.4s infinite;}
.nx-log{display:flex; flex-direction:column; gap:9px; overflow:auto; padding-right:4px; flex:1; max-height:520px;}
.nx-log-empty{color:var(--dim); font-size:11px; text-align:center; padding:30px 0;}
.nx-log-row{display:flex; gap:9px; animation:logIn .3s ease;}
.nx-log-rail{width:2px; border-radius:2px; flex-shrink:0; opacity:0.7;}
.nx-log-body{flex:1; min-width:0; padding-bottom:2px;}
.nx-log-top{display:flex; align-items:center; gap:8px;}
.nx-log-agent{font-size:10px; font-weight:800; letter-spacing:0.08em;}
.nx-log-code{font-size:9px; color:var(--dim);}
.nx-log-t{font-size:9px; color:var(--dim); margin-left:auto;}
.nx-log-text{font-size:10.5px; color:#CBD5E1; line-height:1.5; margin-top:3px; font-family:ui-monospace,monospace;}

/* charts */
.nx-charts{display:grid; grid-template-columns:repeat(4,1fr); gap:12px;}
.nx-chart{padding:12px 12px 6px;}
.nx-chart-head{display:flex; flex-direction:column; margin-bottom:4px;}
.nx-chart-title{font-size:12px; font-weight:700;}
.nx-chart-sub{font-size:9.5px; color:var(--mut); letter-spacing:0.04em;}

.nx-foot{font-size:9.5px; color:var(--dim); text-align:center; padding:4px 0 2px; letter-spacing:0.05em;}

/* scrollbars */
.nx-log::-webkit-scrollbar,.nx-agent-list::-webkit-scrollbar{width:5px;}
.nx-log::-webkit-scrollbar-thumb,.nx-agent-list::-webkit-scrollbar-thumb{background:rgba(56,189,248,0.25); border-radius:3px;}

/* keyframes */
@keyframes blink{0%,100%{opacity:1}50%{opacity:0.35}}
@keyframes ring{0%{transform:scale(0.9); opacity:0.5}100%{transform:scale(1.4); opacity:0}}
@keyframes slidein{from{transform:translateX(20px); opacity:0}to{transform:translateX(0); opacity:1}}
@keyframes logIn{from{transform:translateY(-6px); opacity:0}to{transform:translateY(0); opacity:1}}

@media (max-width:1180px){
  .nx-grid{grid-template-columns:1fr;}
  .nx-charts{grid-template-columns:repeat(2,1fr);}
  .nx-stats{grid-template-columns:repeat(2,1fr);}
  .nx-log{max-height:300px;}
}
@media (prefers-reduced-motion:reduce){
  .nx-pill .dot,.nx-live-dot,.nx-agent-pulse,.nx-notif,.nx-log-row{animation:none!important;}
}
`;
