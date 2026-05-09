from __future__ import annotations

from pathlib import Path
from typing import Any, Dict
from uuid import uuid4

from app.chat_orchestrator import FollowUpChatOrchestrator
from app.hydradb_client import HydraDBClient
from app.pipeshift_client import PipeshiftClient
from app.retrieval import rank_events_by_relevance


class IncidentOrchestrator:
    def __init__(
        self,
        data_dir: Path,
        hydradb_api_key: str | None,
        hydradb_tenant: str,
        pipeshift_api_key: str | None,
        pipeshift_model: str,
        pipeshift_api_url: str,
        hydradb_store_path: Path | None = None,
        hydradb_base_url: str | None = None,
        hydradb_cloud_tenant_id: str | None = None,
    ) -> None:
        self.hydradb = HydraDBClient(
            data_dir=data_dir,
            api_key=hydradb_api_key,
            tenant=hydradb_tenant,
            store_path=hydradb_store_path,
            hydradb_base_url=hydradb_base_url,
            hydradb_cloud_tenant_id=hydradb_cloud_tenant_id,
        )
        self.pipeshift = PipeshiftClient(
            api_key=pipeshift_api_key,
            model=pipeshift_model,
            api_url=pipeshift_api_url,
        )
        self.tenant_id = hydradb_tenant
        self.chat = FollowUpChatOrchestrator(self.hydradb, self.tenant_id)

    def start_chat_session(self, incident_id: str, session_id: str | None = None) -> Dict[str, Any]:
        self.hydradb.retrieve_incident_context(incident_id, self.tenant_id)
        similar_incidents = self.hydradb.retrieve_similar_incidents(incident_id, self.tenant_id)
        sid = session_id or str(uuid4())
        self.hydradb.upsert_session(sid, incident_id, similar_incidents, self.tenant_id)
        history = self.hydradb.retrieve_conversation_history(sid, self.tenant_id)
        latest = self.hydradb.retrieve_latest_analysis(incident_id, sid, self.tenant_id)
        hydra_resume = self.hydradb.list_incident_context(incident_id, self.tenant_id)
        return {
            "session_id": sid,
            "incident_id": incident_id,
            "has_analysis": latest is not None,
            "suggested_prompts": self.chat.suggested_prompts(),
            "conversation_history": history,
            "latest_analysis": latest,
            "similar_incidents": similar_incidents,
            "hydra_context_status": self._hydra_status(),
            "hydradb_resume": hydra_resume,
        }

    def analyze(self, incident_id: str, query: str, session_id: str | None = None) -> Dict[str, Any]:
        context = self.hydradb.retrieve_incident_context(incident_id, self.tenant_id)
        ranked_context = rank_events_by_relevance(context, query)
        self.hydradb.store_context(incident_id, ranked_context, self.tenant_id)
        result = self.pipeshift.analyze_incident(ranked_context, query)

        similar = self.hydradb.retrieve_similar_incidents(incident_id, self.tenant_id)
        if session_id:
            effective_session = session_id
            sess = self.hydradb.get_session(session_id, self.tenant_id)
            if not sess:
                self.hydradb.upsert_session(session_id, incident_id, similar, self.tenant_id)
            elif sess.get("incident_id") != incident_id:
                self.hydradb.upsert_session(session_id, incident_id, similar, self.tenant_id)
        else:
            effective_session = str(uuid4())
            self.hydradb.upsert_session(effective_session, incident_id, similar, self.tenant_id)

        self.hydradb.store_analysis_result(
            incident_id, effective_session, query, result, self.tenant_id
        )
        self.hydradb.append_conversation_turn(
            effective_session, incident_id, "user", query, self.tenant_id
        )
        summary = result.get("root_cause", "Analysis complete.")
        self.hydradb.append_conversation_turn(
            effective_session, incident_id, "assistant", summary, self.tenant_id
        )
        history = self.hydradb.retrieve_conversation_history(effective_session, self.tenant_id)
        out = dict(result)
        out["session_id"] = effective_session
        out["conversation_history"] = history
        out["hydra_memory_synced"] = True
        out["hydra_context_status"] = self._hydra_status()
        return out

    def chat_message(self, session_id: str, message: str) -> Dict[str, Any]:
        return self.chat.handle_message(session_id, message)

    def _hydra_status(self) -> str:
        tid = self.hydradb.hydra_cloud_tenant_id
        if self.hydradb.is_hydra_cloud_active():
            local = (
                "SQLite in-memory fallback (no local DB file)"
                if self.hydradb.is_memory_fallback()
                else "SQLite backing structured sessions/analyses"
            )
            return f"HydraDB Cloud active (tenant_id={tid}). {local}."
        if self.hydradb.is_memory_fallback():
            return "HydraDB Cloud offline — Using SQLite fallback (in-memory; HydraDB unavailable or not configured)."
        return "HydraDB Cloud offline — Using SQLite fallback (local file). Set HYDRADB_API_KEY, HYDRADB_TENANT_ID, HYDRADB_BASE_URL for cloud context."
