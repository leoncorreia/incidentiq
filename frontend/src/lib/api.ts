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

const API_BASE = (import.meta as any).env?.VITE_API_URL || "http://localhost:10000";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`API ${res.status}: ${errorBody || res.statusText}`);
  }
  return (await res.json()) as T;
}

export async function getIncidents(opts?: { demo?: boolean }): Promise<Incident[]> {
  const q = opts?.demo === true ? "?demo=true" : "?demo=false";
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

export async function sendIncidentChatMessage(payload: ChatMessagePayload): Promise<ChatMessageResponse> {
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
