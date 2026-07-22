// Minimal typed API client for the NEXUS backend.
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function token(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem("nexus_access");
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  const t = token();
  if (t) headers.set("Authorization", `Bearer ${t}`);

  const res = await fetch(`${BASE}/api/v1${path}`, { ...init, headers });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  login: async (email: string, password: string) => {
    const body = new URLSearchParams({ username: email, password });
    const res = await fetch(`${BASE}/api/v1/auth/login`, { method: "POST", body });
    if (!res.ok) throw new Error("Invalid credentials");
    const data = await res.json();
    window.sessionStorage.setItem("nexus_access", data.access_token);
    return data;
  },
  me: () => request("/auth/me"),
  listIncidents: (status?: string) =>
    request(`/incidents${status ? `?status=${status}` : ""}`),
  createIncident: (payload: Record<string, unknown>) =>
    request("/incidents", { method: "POST", body: JSON.stringify(payload) }),
  runPipeline: (payload: Record<string, unknown>) =>
    request("/agents/pipeline", { method: "POST", body: JSON.stringify(payload) }),
  agents: () => request("/agents"),
};
