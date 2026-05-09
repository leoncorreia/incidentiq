export type Severity = "critical" | "high" | "medium" | "low" | "SEV-1" | "SEV-2" | "SEV-3" | "SEV-4";

export interface Incident {
  id: string;
  title: string;
  service: string;
  severity: Severity | string;
  status?: string;
  started_at: string;
  resolved_at?: string | null;
  summary?: string;
  tags?: string[];
  timestamp?: string;
  description?: string;
}

export interface TimelineEvent {
  time?: string;
  timestamp?: string;
  event: string;
  source?: string;
  service?: string;
  severity?: Severity | string;
}

export interface Evidence {
  source?: string;
  type?: string;
  detail: string;
  trace_id?: string;
  timestamp?: string;
}

export interface GraphNode {
  id: string;
  label: string;
  type?: string;
  status?: "healthy" | "degraded" | "failed";
}

export interface GraphEdge {
  source: string;
  target: string;
  label?: string;
  failure?: boolean;
}

export interface AnalyzeResponse {
  root_cause: string;
  confidence: number;
  timeline: TimelineEvent[];
  evidence: Evidence[];
  affected_services: string[];
  blast_radius: string;
  suggested_fix: string;
  recommended_mitigation?: {
    immediate_mitigation: string;
    short_term_fix: string;
    long_term_prevention: string;
  };
  graph_nodes: GraphNode[];
  graph_edges: GraphEdge[];
  session_id?: string | null;
  conversation_history?: Array<{ role: string; content: string; seq?: number }>;
  hydra_memory_synced?: boolean;
  hydra_context_status?: string;
}

export interface AnalyzePayload {
  incident_id: string;
  query: string;
  session_id?: string;
}

export interface ChatStartPayload {
  incident_id: string;
  session_id?: string;
}

export interface HydradbResumeSnapshot {
  hydra_cloud?: boolean;
  knowledge?: unknown;
  memories?: unknown;
}

export interface ChatStartResponse {
  session_id: string;
  incident_id: string;
  has_analysis: boolean;
  suggested_prompts: string[];
  conversation_history?: Array<{ role: string; content: string; seq?: number }>;
  latest_analysis?: AnalyzeResponse | null;
  similar_incidents?: Array<Record<string, unknown>>;
  hydra_context_status?: string;
  hydradb_resume?: HydradbResumeSnapshot | null;
}

export interface ChatMessagePayload {
  session_id: string;
  message: string;
}

export interface ChatMessageResponse {
  session_id: string;
  incident_id: string;
  answer: string;
  sources: string[];
  recall_knowledge_chunks?: number;
  recall_memory_chunks?: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  recall?: { knowledge: number; memory: number };
}

export interface OperationalMemoryResponse {
  incident_id: string;
  hydra_context_layer?: string | null;
  hydra_cloud_active: boolean;
  resume_available: boolean;
  has_analysis: boolean;
  last_analysis_at?: string | null;
  uploaded_artifact_count: number;
  followup_turn_count: number;
  previous_root_cause?: string | null;
  previous_mitigation_summary?: string | null;
  total_events: number;
  context_tokens_estimate: number;
  hydra_remote_knowledge_items: number;
  hydra_remote_memory_items: number;
}

export interface UploadContextResponse {
  incident_id: string;
  tenant_id: string;
  uploaded_files: Array<{
    name: string;
    kind: string;
    size_bytes: number;
    parsed_records: number;
  }>;
  counts: Record<string, number>;
  total_events: number;
  context_tokens_estimate: number;
  hydra_context_layer?: string | null;
}

export interface ContextSourcesResponse {
  incident_id: string;
  uploaded_files: Array<{
    name: string;
    kind: string;
    size_bytes: number;
    parsed_records: number;
  }>;
  counts: Record<string, number>;
  total_events: number;
  context_tokens_estimate: number;
  hydra_context_layer?: string | null;
}

export interface RelatedIncidentsResponse {
  incident_id: string;
  related: Array<Record<string, unknown>>;
}
