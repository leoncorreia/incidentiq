from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List

from pydantic import BaseModel, Field


class AnalyzeRequest(BaseModel):
    incident_id: str
    query: str
    session_id: str | None = None


class Incident(BaseModel):
    id: str
    title: str
    service: str
    severity: str
    status: str
    started_at: datetime
    resolved_at: datetime | None = None
    summary: str
    tags: List[str] = Field(default_factory=list)


class WorkspaceIncidentCreate(BaseModel):
    title: str = "New investigation"


class AnalyzeResponse(BaseModel):
    root_cause: str
    confidence: float
    timeline: List[Dict[str, Any]]
    evidence: List[Dict[str, Any]]
    affected_services: List[str]
    blast_radius: str
    suggested_fix: str
    recommended_mitigation: Dict[str, str]
    graph_nodes: List[Dict[str, Any]]
    graph_edges: List[Dict[str, Any]]
    session_id: str | None = None
    conversation_history: List[Dict[str, Any]] = Field(default_factory=list)
    hydra_memory_synced: bool = False
    hydra_context_status: str = ""


class ChatStartRequest(BaseModel):
    incident_id: str
    session_id: str | None = None


class ChatStartResponse(BaseModel):
    session_id: str
    incident_id: str
    has_analysis: bool
    suggested_prompts: List[str]
    conversation_history: List[Dict[str, Any]] = Field(default_factory=list)
    latest_analysis: Dict[str, Any] | None = None
    similar_incidents: List[Dict[str, Any]] = Field(default_factory=list)
    hydra_context_status: str = ""
    hydradb_resume: Dict[str, Any] | None = None


class ChatMessageRequest(BaseModel):
    session_id: str
    message: str


class ChatMessageResponse(BaseModel):
    session_id: str
    incident_id: str
    answer: str
    sources: List[str] = Field(default_factory=list)
    recall_knowledge_chunks: int = 0
    recall_memory_chunks: int = 0


class OperationalMemoryResponse(BaseModel):
    incident_id: str
    hydra_context_layer: str | None = None
    hydra_cloud_active: bool = False
    resume_available: bool = False
    has_analysis: bool = False
    last_analysis_at: str | None = None
    uploaded_artifact_count: int = 0
    followup_turn_count: int = 0
    previous_root_cause: str | None = None
    previous_mitigation_summary: str | None = None
    total_events: int = 0
    context_tokens_estimate: int = 0
    hydra_remote_knowledge_items: int = 0
    hydra_remote_memory_items: int = 0


class UploadResponse(BaseModel):
    incident_id: str
    tenant_id: str
    uploaded_files: List[Dict[str, Any]]
    counts: Dict[str, int]
    total_events: int
    context_tokens_estimate: int
    hydra_context_layer: str | None = None


class ContextSourcesResponse(BaseModel):
    incident_id: str
    uploaded_files: List[Dict[str, Any]]
    counts: Dict[str, int]
    total_events: int
    context_tokens_estimate: int
    hydra_context_layer: str | None = None


class RunbookPersistRequest(BaseModel):
    markdown: str
    session_id: str | None = None


class RelatedIncidentsResponse(BaseModel):
    incident_id: str
    related: List[Dict[str, Any]]
