from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.ingestion import IngestionService
from app.orchestrator import IncidentOrchestrator
from app.schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    ChatMessageRequest,
    ChatMessageResponse,
    ChatStartRequest,
    ChatStartResponse,
    ContextSourcesResponse,
    Incident,
    OperationalMemoryResponse,
    RelatedIncidentsResponse,
    RunbookPersistRequest,
    UploadResponse,
    WorkspaceIncidentCreate,
)

BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"

settings = get_settings()
ingestion_service = IngestionService(upload_root=BASE_DIR / "uploads")
orchestrator = IncidentOrchestrator(
    data_dir=DATA_DIR,
    hydradb_api_key=settings.hydradb_api_key,
    hydradb_tenant=settings.hydradb_tenant,
    pipeshift_api_key=settings.pipeshift_api_key,
    pipeshift_model=settings.pipeshift_model,
    pipeshift_api_url=settings.pipeshift_api_url,
    hydradb_store_path=Path(settings.hydradb_store_path)
    if settings.hydradb_store_path
    else None,
    hydradb_base_url=settings.hydradb_base_url,
    hydradb_cloud_tenant_id=settings.hydradb_tenant_id or settings.hydradb_tenant,
)

app = FastAPI(title="IncidentIQ API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _load_incidents() -> List[dict]:
    with (DATA_DIR / "incidents.json").open("r", encoding="utf-8") as f:
        return json.load(f)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "incidentiq-backend"}


@app.get("/incidents", response_model=List[Incident])
def incidents(demo: bool = Query(False, description="If true, return bundled demo seed incidents.")) -> List[Incident]:
    if demo:
        return [Incident(**incident) for incident in _load_incidents()]
    rows = orchestrator.hydradb.list_workspace_incidents(settings.hydradb_tenant)
    return [Incident(**row) for row in rows]


@app.post("/incidents/workspace", response_model=Incident)
def create_workspace_incident(body: WorkspaceIncidentCreate | None = None) -> Incident:
    payload = body or WorkspaceIncidentCreate()
    now = datetime.now(timezone.utc).replace(microsecond=0)
    record = {
        "id": f"iq_{uuid.uuid4().hex[:10]}",
        "title": payload.title,
        "service": "pending-source",
        "severity": "SEV-3",
        "status": "investigating",
        "started_at": now,
        "resolved_at": None,
        "summary": "Investigation opened from the console. Add context via upload or connectors.",
        "tags": ["workspace"],
    }
    orchestrator.hydradb.register_workspace_incident(record, settings.hydradb_tenant)
    return Incident(**record)


@app.get("/incident/{incident_id}", response_model=Incident)
def incident(incident_id: str) -> Incident:
    data = next((i for i in _load_incidents() if i["id"] == incident_id), None)
    if data:
        return Incident(**data)
    ws = orchestrator.hydradb.get_workspace_incident(incident_id, settings.hydradb_tenant)
    if ws:
        return Incident(**ws)
    raise HTTPException(status_code=404, detail=f"Incident '{incident_id}' not found")


@app.post("/analyze", response_model=AnalyzeResponse)
def analyze(payload: AnalyzeRequest) -> AnalyzeResponse:
    try:
        result = orchestrator.analyze(payload.incident_id, payload.query, payload.session_id)
        return AnalyzeResponse(**result)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/chat/start", response_model=ChatStartResponse)
def chat_start(payload: ChatStartRequest) -> ChatStartResponse:
    try:
        result = orchestrator.start_chat_session(payload.incident_id, payload.session_id)
        return ChatStartResponse(**result)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/chat/message", response_model=ChatMessageResponse)
def chat_message(payload: ChatMessageRequest) -> ChatMessageResponse:
    try:
        result = orchestrator.chat_message(payload.session_id, payload.message)
        return ChatMessageResponse(**result)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/upload", response_model=UploadResponse)
async def upload_context(
    incident_id: str = Form(...),
    tenant_id: str | None = Form(default=None),
    files: List[UploadFile] = File(...),
) -> UploadResponse:
    effective_tenant = tenant_id or settings.hydradb_tenant
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")

    try:
        ingest = await ingestion_service.ingest(effective_tenant, incident_id, files)
        parsed = ingest["parsed"]
        uploaded_files = ingest["uploaded_files"]
        saved_files = ingest.get("saved_files") or []
        orchestrator.hydradb.ingest_context(incident_id, parsed, uploaded_files, effective_tenant)
        orchestrator.hydradb.upload_knowledge_files(incident_id, saved_files, effective_tenant)
        summary = orchestrator.hydradb.get_context_sources(incident_id, effective_tenant)
        return UploadResponse(
            incident_id=incident_id,
            tenant_id=effective_tenant,
            uploaded_files=uploaded_files,
            counts=summary["counts"],
            total_events=summary["total_events"],
            context_tokens_estimate=summary["context_tokens_estimate"],
            hydra_context_layer=summary.get("hydra_context_layer"),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/incidents/{incident_id}/operational-memory", response_model=OperationalMemoryResponse)
def operational_memory(
    incident_id: str,
    include_remote: bool = Query(
        True,
        description="If false, skips Hydra list_data calls (faster for incident-list badges).",
    ),
) -> OperationalMemoryResponse:
    raw = orchestrator.hydradb.get_operational_memory_view(
        incident_id, settings.hydradb_tenant, include_remote=include_remote
    )
    return OperationalMemoryResponse(**raw)


@app.get("/context/{incident_id}", response_model=ContextSourcesResponse)
def context_sources(incident_id: str) -> ContextSourcesResponse:
    try:
        summary = orchestrator.hydradb.get_context_sources(incident_id, settings.hydradb_tenant)
        return ContextSourcesResponse(**summary)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/incidents/{incident_id}/related", response_model=RelatedIncidentsResponse)
def related_incidents(incident_id: str) -> RelatedIncidentsResponse:
    try:
        related = orchestrator.hydradb.retrieve_similar_incidents(incident_id, settings.hydradb_tenant)
        return RelatedIncidentsResponse(incident_id=incident_id, related=related)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/incidents/{incident_id}/runbook")
def persist_runbook(incident_id: str, body: RunbookPersistRequest) -> dict:
    orchestrator.hydradb.store_generated_runbook(
        incident_id,
        body.markdown,
        body.session_id,
        settings.hydradb_tenant,
    )
    return {"status": "ok", "incident_id": incident_id, "stored_in": "hydra"}
