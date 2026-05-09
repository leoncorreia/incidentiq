import type {
  AnalyzePayload,
  AnalyzeResponse,
  ChatMessagePayload,
  ChatMessageResponse,
  ChatStartPayload,
  ChatStartResponse,
  ContextSourcesResponse,
  Incident,
  OperationalMemoryResponse,
  RelatedIncidentsResponse,
  UploadContextResponse,
} from "@/types";

/**
 * - Production / preview: set `VITE_API_URL` to your deployed API.
 * - Local dev: if unset, use same-origin `/api` (Vite proxies to port 10000) so LAN URLs and mixed localhost/127.0.0.1 avoid CORS.
 */
function resolveApiBase(): string {
  const envUrl = import.meta.env.VITE_API_URL;
  if (typeof envUrl === "string" && envUrl.trim()) {
    return envUrl.replace(/\/$/, "");
  }
  if (import.meta.env.SSR) {
    return "http://127.0.0.1:10000";
  }
  if (import.meta.env.DEV) {
    return "/api";
  }
  return "http://127.0.0.1:10000";
}

const API_BASE = resolveApiBase();

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: HeadersInit = { ...(options.headers || {}) };
  if (options.body != null && !(headers as Record<string, string>)["Content-Type"]) {
    (headers as Record<string, string>)["Content-Type"] = "application/json";
  }
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`API ${res.status}: ${errorBody || res.statusText}`);
  }
  return (await res.json()) as T;
}

/**
 * When true, load `/incidents?demo=false` (Hydra/SQLite workspace rows only).
 * Any other value (undefined, true, "true", 1, …) uses bundled seed incidents — avoids empty list when `demo` is not a strict boolean from the router.
 */
export function isWorkspaceIncidentListMode(demo: unknown): boolean {
  if (demo === false || demo === 0 || demo === "0") return true;
  if (typeof demo === "string" && demo.toLowerCase() === "false") return true;
  return false;
}

export async function getIncidents(opts?: { demo?: unknown }): Promise<Incident[]> {
  const q = isWorkspaceIncidentListMode(opts?.demo) ? "?demo=false" : "?demo=true";
  return request<Incident[]>(`/incidents${q}`);
}

export async function createWorkspaceIncident(title?: string): Promise<Incident> {
  return request<Incident>("/incidents/workspace", {
    method: "POST",
    body: JSON.stringify(title ? { title } : {}),
  });
}

export async function getIncident(id: string): Promise<Incident> {
  return request<Incident>(`/incident/${id}`);
}

export async function analyzeIncident(payload: AnalyzePayload): Promise<AnalyzeResponse> {
  return request<AnalyzeResponse>("/analyze", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function startIncidentChat(payload: ChatStartPayload): Promise<ChatStartResponse> {
  return request<ChatStartResponse>("/chat/start", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function sendIncidentChatMessage(
  payload: ChatMessagePayload,
): Promise<ChatMessageResponse> {
  return request<ChatMessageResponse>("/chat/message", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function uploadIncidentContext(
  incidentId: string,
  files: File[],
  tenantId?: string,
): Promise<UploadContextResponse> {
  const form = new FormData();
  form.append("incident_id", incidentId);
  if (tenantId) form.append("tenant_id", tenantId);
  files.forEach((f) => form.append("files", f));

  const res = await fetch(`${API_BASE}/upload`, { method: "POST", body: form });
  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`API ${res.status}: ${errorBody || res.statusText}`);
  }
  return (await res.json()) as UploadContextResponse;
}

export async function getContextSources(incidentId: string): Promise<ContextSourcesResponse> {
  return request<ContextSourcesResponse>(`/context/${incidentId}`);
}

export async function getOperationalMemory(
  incidentId: string,
  includeRemote = true,
): Promise<OperationalMemoryResponse> {
  const q = includeRemote ? "" : "?include_remote=false";
  return request<OperationalMemoryResponse>(
    `/incidents/${encodeURIComponent(incidentId)}/operational-memory${q}`,
  );
}

export async function getRelatedIncidents(incidentId: string): Promise<RelatedIncidentsResponse> {
  return request<RelatedIncidentsResponse>(`/incidents/${encodeURIComponent(incidentId)}/related`);
}

export async function persistRunbookToHydra(
  incidentId: string,
  markdown: string,
  sessionId?: string | null,
): Promise<{ status: string; incident_id: string; stored_in: string }> {
  return request(`/incidents/${encodeURIComponent(incidentId)}/runbook`, {
    method: "POST",
    body: JSON.stringify({ markdown, session_id: sessionId ?? null }),
  });
}
