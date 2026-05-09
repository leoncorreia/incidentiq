from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Any, Callable, Dict, List, TypeVar

from app.hydra_store import HydraPersistence, InMemoryHydraPersistence, open_hydra_persistence
from app.retrieval import get_incident_context, get_incident_metadata

logger = logging.getLogger(__name__)

T = TypeVar("T")


def _jsonable(obj: Any) -> Any:
    """Best-effort conversion of Hydra SDK / nested objects for API responses."""
    if obj is None:
        return None
    if isinstance(obj, (str, int, float, bool)):
        return obj
    if isinstance(obj, dict):
        return {str(k): _jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_jsonable(x) for x in obj]
    if hasattr(obj, "model_dump"):
        return _jsonable(obj.model_dump())
    if hasattr(obj, "dict") and callable(getattr(obj, "dict")):
        return _jsonable(obj.dict())  # type: ignore[no-untyped-call]
    return str(obj)

try:
    from hydra_db import HydraDB
    from hydra_db.types.memory_item import MemoryItem
    from hydra_db.types.user_assistant_pair import UserAssistantPair

    _HYDRA_SDK_AVAILABLE = True
except ImportError:
    HydraDB = None  # type: ignore[misc, assignment]
    MemoryItem = None  # type: ignore[misc, assignment]
    UserAssistantPair = None  # type: ignore[misc, assignment]
    _HYDRA_SDK_AVAILABLE = False


class HydraDBClient:
    """
    Operational memory: SQLite (always) for structured IncidentIQ state + optional HydraDB Cloud
    (knowledge base + user memory) when HYDRADB_API_KEY and HYDRADB_BASE_URL are set.
    """

    def __init__(
        self,
        data_dir: Path,
        api_key: str | None = None,
        tenant: str = "incidentiq-demo",
        store: HydraPersistence | None = None,
        store_path: Path | None = None,
        hydradb_base_url: str | None = None,
        hydradb_cloud_tenant_id: str | None = None,
    ) -> None:
        self.data_dir = data_dir
        self.api_key = (api_key or "").strip() or None
        self.tenant = tenant
        self._hydradb_base_url = (hydradb_base_url or "").rstrip("/") or None
        self._hydra_tid = (hydradb_cloud_tenant_id or tenant).strip()

        if store is not None:
            self._store = store
        else:
            db_path = store_path if store_path is not None else (data_dir / "hydradb.sqlite")
            self._store = open_hydra_persistence(db_path)

        self._sdk: Any = None
        self._cloud_configured = bool(
            self.api_key and self._hydradb_base_url and _HYDRA_SDK_AVAILABLE and HydraDB is not None
        )
        if self._cloud_configured:
            try:
                self._sdk = HydraDB(token=self.api_key, base_url=self._hydradb_base_url)
                self.ensure_tenant()
            except Exception as exc:
                logger.warning("Using SQLite fallback: HydraDB SDK init failed: %s", exc)
                self._sdk = None

    @property
    def hydra_cloud_tenant_id(self) -> str:
        return self._hydra_tid

    def is_hydra_cloud_active(self) -> bool:
        return self._sdk is not None

    def is_memory_fallback(self) -> bool:
        return isinstance(self._store, InMemoryHydraPersistence)

    def _sub_tenant_id(self, incident_id: str) -> str:
        return f"{self._hydra_tid}:{incident_id}"

    def _t(self, tenant_id: str | None) -> str:
        return tenant_id if tenant_id else self.tenant

    def _cloud_call(self, operation: str, fn: Callable[[], T], default: T | None = None) -> T | None:
        if not self._sdk:
            logger.info("Using SQLite fallback (%s): HydraDB not configured or unavailable", operation)
            return default
        try:
            return fn()
        except Exception as exc:
            logger.warning("Using SQLite fallback (%s): %s", operation, exc)
            return default

    # --- HydraDB Cloud (SDK) — required public API ---
    def ensure_tenant(self) -> None:
        if not self._sdk:
            return

        def _create() -> None:
            self._sdk.tenant.create(tenant_id=self._hydra_tid)

        try:
            _create()
            logger.info("HydraDB tenant created: %s", self._hydra_tid)
        except Exception as exc:
            logger.debug("HydraDB tenant.create (often OK if exists): %s", exc)

    def upload_knowledge_files(
        self,
        incident_id: str,
        saved_files: List[Dict[str, Any]],
        tenant_id: str | None = None,
    ) -> None:
        """Upload original incident files to HydraDB knowledge (sub-tenant scoped)."""
        _ = tenant_id  # IncidentIQ routing tenant; Hydra uses _hydra_tid
        if not saved_files:
            return

        def _upload() -> None:
            files: List[Any] = []
            meta_list: List[Dict[str, Any]] = []
            uploaded_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
            for i, sf in enumerate(saved_files):
                path = Path(sf["path"])
                name = sf.get("name") or path.name
                content = path.read_bytes()
                bio = BytesIO(content)
                files.append((name, bio))
                meta_list.append(
                    {
                        "file_id": f"incidentiq-{incident_id}-{i}-{name}",
                        "metadata": {
                            "incident_id": incident_id,
                            "file_type": sf.get("kind", "logs"),
                            "source": "IncidentIQ",
                            "uploaded_at": uploaded_at,
                        },
                    }
                )
            self._sdk.upload.knowledge(
                tenant_id=self._hydra_tid,
                sub_tenant_id=self._sub_tenant_id(incident_id),
                files=files,
                file_metadata=json.dumps(meta_list),
                upsert=True,
            )
            logger.info("HydraDB knowledge uploaded (%s files) incident=%s", len(files), incident_id)

        self._cloud_call("upload_knowledge_files", _upload)

    def store_incident_memory(
        self,
        incident_id: str,
        text: str,
        title: str | None = None,
        metadata: Dict[str, Any] | None = None,
        tenant_id: str | None = None,
        *,
        is_markdown: bool = False,
    ) -> None:
        _ = tenant_id

        def _add() -> None:
            md = dict(metadata or {})
            item = MemoryItem(
                text=text,
                title=title,
                is_markdown=is_markdown,
                infer=False,
                document_metadata=json.dumps(md) if md else None,
            )
            self._sdk.upload.add_memory(
                memories=[item],
                tenant_id=self._hydra_tid,
                sub_tenant_id=self._sub_tenant_id(incident_id),
                upsert=True,
            )
            logger.info("HydraDB memory stored incident=%s title=%s", incident_id, title or "")

        self._cloud_call("store_incident_memory", _add)

    def store_conversation_turn(
        self,
        incident_id: str,
        user_message: str,
        assistant_message: str,
        metadata: Dict[str, Any] | None = None,
        tenant_id: str | None = None,
    ) -> None:
        """Persist a user/assistant turn in HydraDB user memory (not the SQLite session log)."""
        _ = tenant_id
        md = dict(metadata or {})

        def _add() -> None:
            pair = UserAssistantPair(user=user_message, assistant=assistant_message)
            item = MemoryItem(
                user_assistant_pairs=[pair],
                infer=True,
                custom_instructions="IncidentIQ operational incident chat; extract facts for future recall.",
                document_metadata=json.dumps(md) if md else None,
            )
            self._sdk.upload.add_memory(
                memories=[item],
                tenant_id=self._hydra_tid,
                sub_tenant_id=self._sub_tenant_id(incident_id),
                upsert=True,
            )
            logger.info("HydraDB memory stored (conversation turn) incident=%s", incident_id)

        self._cloud_call("store_conversation_turn", _add)

    def recall_incident_knowledge(
        self, incident_id: str, query: str, max_results: int = 10, tenant_id: str | None = None
    ) -> Any | None:
        _ = tenant_id

        def _recall() -> Any | None:
            res = self._sdk.recall.full_recall(
                tenant_id=self._hydra_tid,
                sub_tenant_id=self._sub_tenant_id(incident_id),
                query=query,
                max_results=max_results,
            )
            n = len(res.chunks or [])
            logger.info("HydraDB recall returned %s chunks (knowledge)", n)
            return res

        return self._cloud_call("recall_incident_knowledge", _recall)

    def recall_incident_memory(
        self, incident_id: str, query: str, max_results: int = 10, tenant_id: str | None = None
    ) -> Any | None:
        _ = tenant_id

        def _recall() -> Any | None:
            res = self._sdk.recall.recall_preferences(
                tenant_id=self._hydra_tid,
                sub_tenant_id=self._sub_tenant_id(incident_id),
                query=query,
                max_results=max_results,
            )
            n = len(res.chunks or [])
            logger.info("HydraDB recall returned %s chunks (memory)", n)
            return res

        return self._cloud_call("recall_incident_memory", _recall)

    def _hydra_list_blob_count(self, blob: Any) -> int:
        if blob is None:
            return 0
        if isinstance(blob, list):
            return len(blob)
        if isinstance(blob, dict):
            for key in ("items", "data", "results", "records", "rows"):
                v = blob.get(key)
                if isinstance(v, list):
                    return len(v)
        return 0

    def get_operational_memory_view(
        self, incident_id: str, tenant_id: str | None = None, *, include_remote: bool = True
    ) -> Dict[str, Any]:
        """Unified snapshot for UI: local SQLite meta + optional Hydra list estimates + prior analysis snippets."""
        t = self._t(tenant_id)
        meta = self._store.get_operational_meta(t, incident_id)
        analysis = self._store.retrieve_latest_analysis(t, incident_id, None)
        mit = (analysis or {}).get("recommended_mitigation") or {}
        if not isinstance(mit, dict):
            mit = {}
        summary = self.get_context_sources(incident_id, t)
        kc = 0
        mc = 0
        if include_remote:
            remote = self.list_incident_context(incident_id, t)
            kc = self._hydra_list_blob_count(remote.get("knowledge"))
            mc = self._hydra_list_blob_count(remote.get("memories"))
        resume_available = bool(
            meta.get("has_analysis")
            or (meta.get("uploaded_artifact_count", 0) or 0) > 0
            or kc > 0
            or mc > 0
            or (meta.get("followup_turn_count", 0) or 0) > 0
        )
        return {
            "incident_id": incident_id,
            "hydra_context_layer": self._context_layer_label(),
            "hydra_cloud_active": self.is_hydra_cloud_active(),
            "resume_available": resume_available,
            **meta,
            "previous_root_cause": (analysis or {}).get("root_cause"),
            "previous_mitigation_summary": mit.get("immediate_mitigation"),
            "total_events": summary["total_events"],
            "context_tokens_estimate": summary["context_tokens_estimate"],
            "hydra_remote_knowledge_items": kc,
            "hydra_remote_memory_items": mc,
        }

    def list_incident_context(self, incident_id: str, tenant_id: str | None = None) -> Dict[str, Any]:
        _ = tenant_id
        out: Dict[str, Any] = {"knowledge": None, "memories": None, "hydra_cloud": self.is_hydra_cloud_active()}

        def _list_k() -> Any:
            return self._sdk.fetch.list_data(
                tenant_id=self._hydra_tid,
                sub_tenant_id=self._sub_tenant_id(incident_id),
                kind="knowledge",
                page_size=50,
            )

        def _list_m() -> Any:
            return self._sdk.fetch.list_data(
                tenant_id=self._hydra_tid,
                sub_tenant_id=self._sub_tenant_id(incident_id),
                kind="memories",
                page_size=50,
            )

        if self._sdk:
            try:
                out["knowledge"] = _jsonable(_list_k())
            except Exception as exc:
                logger.warning("list_incident_context knowledge: %s", exc)
            try:
                out["memories"] = _jsonable(_list_m())
            except Exception as exc:
                logger.warning("list_incident_context memories: %s", exc)
        return out

    @staticmethod
    def format_recall_chunks(result: Any | None, label: str) -> str:
        if not result or not result.chunks:
            return ""
        lines = [f"### {label}"]
        for c in result.chunks[:10]:
            lines.append(f"- {c.chunk_content.strip()[:1200]}")
        return "\n".join(lines)

    # --- Incident workspace (SQLite) ---
    def create_incident_workspace(self, record: Dict[str, Any], tenant_id: str | None = None) -> None:
        t = self._t(tenant_id)
        self._store.upsert_incident(t, record["id"], record, "workspace")

    def register_workspace_incident(self, record: Dict[str, Any], tenant_id: str | None = None) -> None:
        self.create_incident_workspace(record, tenant_id)

    def list_workspace_incidents(self, tenant_id: str | None = None) -> List[Dict[str, Any]]:
        return self._store.list_workspace_incidents(self._t(tenant_id))

    def get_workspace_incident(self, incident_id: str, tenant_id: str | None = None) -> Dict[str, Any] | None:
        return self._store.get_incident_payload(self._t(tenant_id), incident_id)

    def _resolve_incident_row(self, incident_id: str, tenant_id: str | None = None) -> Dict[str, Any]:
        t = self._t(tenant_id)
        ws = self._store.get_incident_payload(t, incident_id)
        if ws is not None:
            return ws
        return get_incident_metadata(incident_id, self.data_dir)

    def store_context(self, incident_id: str, context: Dict[str, Any], tenant_id: str | None = None) -> None:
        self._store.set_ranked_context(self._t(tenant_id), incident_id, context)

    def _uploaded_has_data(self, incident_id: str, tenant_id: str | None = None) -> bool:
        u = self._store.get_upload_aggregate(self._t(tenant_id), incident_id)
        if u.get("files"):
            return True
        return any(len(u.get(k, [])) > 0 for k in ("logs", "deploys", "alerts", "metrics", "runbooks"))

    def retrieve_incident_context(self, incident_id: str, tenant_id: str | None = None) -> Dict[str, Any]:
        t = self._t(tenant_id)
        if self._uploaded_has_data(incident_id, t):
            incident = self._resolve_incident_row(incident_id, t)
            u = self._store.get_upload_aggregate(t, incident_id)
            return {
                "incident": incident,
                "logs": list(u.get("logs", [])),
                "deploys": list(u.get("deploys", [])),
                "alerts": list(u.get("alerts", [])),
                "metrics": list(u.get("metrics", [])),
                "runbooks": list(u.get("runbooks", [])),
                "context_mode": "upload_only",
            }

        row = self._resolve_incident_row(incident_id, t)
        context = get_incident_context(incident_id, self.data_dir, incident_row=row)
        return self._merge_uploaded_context(incident_id, context, t)

    def store_uploaded_context(
        self,
        incident_id: str,
        parsed: Dict[str, Any],
        files: List[Dict[str, Any]],
        tenant_id: str | None = None,
    ) -> None:
        self._store.append_upload_aggregate(self._t(tenant_id), incident_id, parsed, files)

    def ingest_context(
        self, incident_id: str, parsed: Dict[str, Any], files: List[Dict[str, Any]], tenant_id: str | None = None
    ) -> None:
        self.store_uploaded_context(incident_id, parsed, files, tenant_id)

    def _context_layer_label(self) -> str:
        if self.is_hydra_cloud_active():
            return "hydra_cloud"
        if self.is_memory_fallback():
            return "memory_fallback"
        return "sqlite"

    def get_context_sources(self, incident_id: str, tenant_id: str | None = None) -> Dict[str, Any]:
        context = self.retrieve_incident_context(incident_id, tenant_id)
        t = self._t(tenant_id)
        uploaded = self._store.get_upload_aggregate(t, incident_id)
        total_events = (
            len(context.get("logs", []))
            + len(context.get("deploys", []))
            + len(context.get("alerts", []))
            + len(context.get("metrics", []))
            + len(context.get("runbooks", []))
        )
        return {
            "incident_id": incident_id,
            "uploaded_files": uploaded.get("files", []),
            "counts": {
                "logs": len(context.get("logs", [])),
                "deploys": len(context.get("deploys", [])),
                "alerts": len(context.get("alerts", [])),
                "metrics": len(context.get("metrics", [])),
                "runbooks": len(context.get("runbooks", [])),
            },
            "total_events": total_events,
            "context_tokens_estimate": total_events * 55,
            "hydra_context_layer": self._context_layer_label(),
        }

    def _merge_uploaded_context(
        self, incident_id: str, context: Dict[str, Any], tenant_id: str | None = None
    ) -> Dict[str, Any]:
        uploaded = self._store.get_upload_aggregate(self._t(tenant_id), incident_id)
        if not any(
            len(uploaded.get(k, [])) > 0 for k in ("logs", "deploys", "alerts", "metrics", "runbooks")
        ) and not uploaded.get("files"):
            return context
        merged = dict(context)
        for key in ["logs", "deploys", "alerts", "metrics", "runbooks"]:
            merged[key] = [*context.get(key, []), *uploaded.get(key, [])]
        return merged

    def retrieve_similar_incidents(self, incident_id: str, tenant_id: str | None = None) -> List[Dict[str, Any]]:
        t = self._t(tenant_id)
        try:
            current = self._resolve_incident_row(incident_id, t)
        except ValueError:
            return []

        current_service = current.get("service") or ""
        current_tags = set(current.get("tags") or [])

        incidents_path = self.data_dir / "incidents.json"
        seed: List[Dict[str, Any]] = []
        if incidents_path.exists():
            seed = json.loads(incidents_path.read_text(encoding="utf-8"))

        hydra_stubs = self._store.list_incident_stubs_for_similarity(t)
        candidates: Dict[str, Dict[str, Any]] = {}
        for row in seed:
            candidates[row["id"]] = row
        for stub in hydra_stubs:
            iid = stub["id"]
            if iid not in candidates:
                payload = self._store.get_incident_payload(t, iid)
                if payload:
                    candidates[iid] = payload

        scored: List[tuple[float, Dict[str, Any]]] = []
        for iid, row in candidates.items():
            if iid == incident_id:
                continue
            svc = row.get("service") or ""
            tags = set(row.get("tags") or [])
            score = 0.0
            if current_service and svc == current_service:
                score += 10.0
            score += len(current_tags & tags) * 2.0
            if score > 0:
                slim = {
                    "id": row.get("id", iid),
                    "title": row.get("title", ""),
                    "service": svc,
                    "severity": row.get("severity", ""),
                    "similarity_score": round(score, 2),
                }
                scored.append((score, slim))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [r for _, r in scored[:5]]

    def store_analysis_result(
        self,
        incident_id: str,
        session_id: str | None,
        query: str,
        analysis: Dict[str, Any],
        tenant_id: str | None = None,
    ) -> None:
        self._store.store_analysis_result(self._t(tenant_id), incident_id, session_id, query, analysis)
        summary_lines = [
            f"Query: {query}",
            f"Root cause: {analysis.get('root_cause', '')}",
            f"Blast radius: {analysis.get('blast_radius', '')}",
            f"Suggested fix: {analysis.get('suggested_fix', '')}",
        ]
        mit = analysis.get("recommended_mitigation") or {}
        if isinstance(mit, dict):
            summary_lines.extend(
                [
                    f"Immediate mitigation: {mit.get('immediate_mitigation', '')}",
                    f"Short-term: {mit.get('short_term_fix', '')}",
                    f"Long-term: {mit.get('long_term_prevention', '')}",
                ]
            )
        ev = analysis.get("evidence") or []
        if ev:
            summary_lines.append("Evidence:")
            for e in ev[:6]:
                if isinstance(e, dict):
                    summary_lines.append(f"  - {e.get('detail', e)}")
        summary_lines.append(f"Timeline events: {len(analysis.get('timeline') or [])}")
        blob = "\n".join(summary_lines)
        self.store_incident_memory(
            incident_id,
            blob,
            title=f"Analysis session {session_id or 'n/a'}",
            metadata={
                "type": "analysis",
                "session_id": session_id,
                "incident_id": incident_id,
                "source": "IncidentIQ",
            },
            tenant_id=tenant_id,
        )

    def retrieve_latest_analysis(
        self, incident_id: str, session_id: str | None = None, tenant_id: str | None = None
    ) -> Dict[str, Any] | None:
        return self._store.retrieve_latest_analysis(self._t(tenant_id), incident_id, session_id)

    def append_conversation_turn(
        self,
        session_id: str,
        incident_id: str,
        role: str,
        content: str,
        tenant_id: str | None = None,
    ) -> int:
        return self._store.append_conversation_turn(self._t(tenant_id), session_id, incident_id, role, content)

    def retrieve_conversation_history(
        self, session_id: str, tenant_id: str | None = None
    ) -> List[Dict[str, Any]]:
        return self._store.retrieve_conversation_history(self._t(tenant_id), session_id)

    def upsert_session(
        self,
        session_id: str,
        incident_id: str,
        similar_incidents: List[Dict[str, Any]],
        tenant_id: str | None = None,
    ) -> None:
        self._store.upsert_session(self._t(tenant_id), session_id, incident_id, similar_incidents)

    def get_session(self, session_id: str, tenant_id: str | None = None) -> Dict[str, Any] | None:
        return self._store.get_session(self._t(tenant_id), session_id)

    def store_generated_runbook(
        self,
        incident_id: str,
        markdown: str,
        session_id: str | None = None,
        tenant_id: str | None = None,
    ) -> None:
        self._store.store_generated_runbook(self._t(tenant_id), incident_id, session_id, markdown)
        self.store_incident_memory(
            incident_id,
            markdown,
            title="Generated runbook / postmortem",
            metadata={"type": "runbook", "session_id": session_id, "source": "IncidentIQ"},
            tenant_id=tenant_id,
            is_markdown=True,
        )

    def list_generated_runbooks(
        self, incident_id: str, limit: int = 5, tenant_id: str | None = None
    ) -> List[Dict[str, Any]]:
        return self._store.list_generated_runbooks(self._t(tenant_id), incident_id, limit)
