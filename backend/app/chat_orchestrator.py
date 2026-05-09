from __future__ import annotations

import re
from typing import Any, Dict, List

from app.constants import SUGGESTED_PROMPTS
from app.hydradb_client import HydraDBClient


def _recall_chunk_count(result: Any) -> int:
    if result is None:
        return 0
    chunks = getattr(result, "chunks", None)
    if chunks is None:
        return 0
    return len(chunks)


def _mitigation(analysis: Dict[str, Any]) -> Dict[str, str]:
    m = analysis.get("recommended_mitigation")
    return m if isinstance(m, dict) else {}


_DB_RE = re.compile(
    r"\b(postgres|postgresql|sql\b|database|db pool|connection pool|\bdb\b)\b",
    re.IGNORECASE,
)

# Broader than _DB_RE: narrative often says "pool", "timeout", "saturation" without naming Postgres.
_DB_CONTEXT_RE = re.compile(
    r"\b("
    r"postgres|postgresql|sql\b|database|\bdb\b|db pool|connection pool|pool|connections?|"
    r"timeout|timeouts|saturation|exhaust|concurr|jdbc|orm|query latency"
    r")\b",
    re.IGNORECASE,
)


def _analysis_text_blobs(analysis: Dict[str, Any]) -> List[str]:
    """Collect free-text fields from the saved analysis for keyword / grounding search."""
    out: List[str] = []
    for key in ("root_cause", "blast_radius", "suggested_fix", "confidence"):
        v = analysis.get(key)
        if isinstance(v, str) and v.strip():
            out.append(v.strip())
    mit = analysis.get("recommended_mitigation")
    if isinstance(mit, dict):
        for k in ("immediate_mitigation", "short_term_fix", "long_term_prevention"):
            s = mit.get(k)
            if isinstance(s, str) and s.strip():
                out.append(s.strip())
    for svc in analysis.get("affected_services") or []:
        if isinstance(svc, str) and svc.strip():
            out.append(svc.strip())
    for ev in analysis.get("timeline") or []:
        if isinstance(ev, dict):
            for k in ("event", "time", "timestamp", "detail"):
                s = ev.get(k)
                if isinstance(s, str) and s.strip():
                    out.append(s.strip())
    for e in analysis.get("evidence") or []:
        if isinstance(e, dict):
            label = str(e.get("source") or e.get("type") or "").strip()
            detail = str(e.get("detail") or "").strip()
            if label or detail:
                out.append(f"{label}: {detail}".strip(": ").strip())
    return out


def _db_grounding_from_analysis(analysis: Dict[str, Any], limit: int = 5) -> List[str]:
    """Lines from the saved analysis that support a DB / pool / timeout narrative."""
    seen: set[str] = set()
    found: List[str] = []
    for blob in _analysis_text_blobs(analysis):
        if not _DB_CONTEXT_RE.search(blob):
            continue
        key = blob[:500]
        if key in seen:
            continue
        seen.add(key)
        found.append(blob if len(blob) <= 400 else blob[:397] + "…")
        if len(found) >= limit:
            break
    return found


def _wants_next_steps(q: str) -> bool:
    return any(
        phrase in q
        for phrase in (
            "what to do",
            "what do we do",
            "what should we do",
            "next step",
            "next steps",
            "how do we fix",
            "remediation",
            "actions now",
        )
    )


def _wants_narrative_explanation(q: str) -> bool:
    if "what happened" in q or "explain this" in q or "walk me through" in q:
        return True
    if "root cause" in q and "evidence" not in q:
        return True
    if "why" not in q:
        return False
    return any(
        k in q
        for k in (
            "spike",
            "latency",
            "slow",
            "outage",
            "incident",
            "fail",
            "happen",
            "happened",
            "cause",
            "pm",
            "2:17",
        )
    )


def _format_evidence_answer(analysis: Dict[str, Any]) -> str:
    evidence = analysis.get("evidence") or []
    lines: List[str] = ["**Supporting evidence** (from the saved analysis):"]
    if evidence:
        for e in evidence[:8]:
            label = str(e.get("source") or e.get("type") or "signal").strip()
            detail = str(e.get("detail") or "").strip()
            if detail:
                lines.append(f"- **{label}:** {detail}")
    else:
        lines.append("- _No evidence objects were attached to the last analysis payload._")

    timeline = analysis.get("timeline") or []
    if timeline:
        lines.append("")
        lines.append("**Correlated timeline (excerpt):**")
        for ev in timeline[:5]:
            t = str(ev.get("time") or ev.get("timestamp") or "").strip()
            desc = str(ev.get("event") or "").strip()
            if desc:
                lines.append(f"- {t + ': ' if t else ''}{desc}")

    mit = _mitigation(analysis)
    imm = str(mit.get("immediate_mitigation") or "").strip()
    if imm:
        lines.append("")
        lines.append("**If you need the mitigation (separate from evidence):**")
        lines.append(imm[:800])
    return "\n".join(lines)


def _format_next_steps(analysis: Dict[str, Any]) -> str:
    mit = _mitigation(analysis)
    parts = [
        "**What to do next** (from saved mitigation plan):",
        "",
        "**1. Immediate**",
        mit.get("immediate_mitigation", "Rollback or contain the last risky change; verify SLOs.").strip() or "—",
        "",
        "**2. Short-term**",
        mit.get("short_term_fix", "Reduce blast radius; add guardrails and validation.").strip() or "—",
        "",
        "**3. Long-term**",
        mit.get("long_term_prevention", "Hardening, alerts, and rollout policy.").strip() or "—",
    ]
    sf = str(analysis.get("suggested_fix") or "").strip()
    if sf:
        parts.extend(["", "**Suggested technical direction:**", sf[:600]])
    return "\n".join(parts)


def _format_narrative_explanation(analysis: Dict[str, Any]) -> str:
    rc = str(analysis.get("root_cause") or "").strip()
    br = str(analysis.get("blast_radius") or "").strip()
    lines = [
        "**What we think happened:**",
        rc or "—",
    ]
    if br:
        lines.extend(["", "**Blast radius:**", br])
    evidence = analysis.get("evidence") or []
    if evidence:
        lines.extend(["", "**Signals that back this up:**"])
        for e in evidence[:4]:
            d = str(e.get("detail") or "").strip()
            if d:
                lines.append(f"- {d}")
    return "\n".join(lines)


class FollowUpChatOrchestrator:
    """Follow-up reasoning grounded in HydraDB-persisted analysis and incident memory."""

    def __init__(self, hydradb: HydraDBClient, tenant_id: str) -> None:
        self.hydradb = hydradb
        self.tenant_id = tenant_id

    def handle_message(self, session_id: str, message: str) -> Dict[str, Any]:
        session = self.hydradb.get_session(session_id, self.tenant_id)
        if not session:
            raise ValueError("Session not found. Please start from an incident.")

        incident_id = session["incident_id"]
        analysis = self.hydradb.retrieve_latest_analysis(incident_id, session_id, self.tenant_id)
        if not analysis:
            return {
                "session_id": session_id,
                "incident_id": incident_id,
                "answer": "Run root cause analysis first so I can answer from HydraDB incident memory and mitigations.",
                "sources": ["analysis_required"],
                "recall_knowledge_chunks": 0,
                "recall_memory_chunks": 0,
            }

        q = message.lower().strip()
        sources: list[str] = []
        answer: str

        if "rollback" in q:
            answer = _mitigation(analysis).get(
                "immediate_mitigation",
                "Rollback the most recent risky deploy for the affected service.",
            )
            sources = ["recommended_mitigation.immediate_mitigation", "hydra.analysis", "timeline.deploy"]
        elif "evidence" in q:
            answer = _format_evidence_answer(analysis)
            sources = ["evidence", "timeline", "hydra.analysis"]
        elif "postmortem" in q:
            mit = _mitigation(analysis)
            answer = (
                f"Incident {incident_id} postmortem summary:\n"
                f"Root cause: {analysis.get('root_cause', 'N/A')}\n"
                f"Blast radius: {analysis.get('blast_radius', 'N/A')}\n"
                f"Immediate mitigation: {mit.get('immediate_mitigation', 'N/A')}\n"
                f"Short-term fix: {mit.get('short_term_fix', 'N/A')}\n"
                f"Long-term prevention: {mit.get('long_term_prevention', 'N/A')}"
            )
            sources = ["root_cause", "blast_radius", "recommended_mitigation", "hydra.analysis"]
        elif _DB_RE.search(q):
            evidence = analysis.get("evidence", [])
            db_evidence = [
                str(e.get("detail", "")).strip()
                for e in evidence
                if isinstance(e, dict)
                and (
                    _DB_CONTEXT_RE.search(str(e.get("detail", "")))
                    or _DB_CONTEXT_RE.search(str(e.get("source", "")))
                )
            ]
            narrative = _db_grounding_from_analysis(analysis)
            if narrative:
                answer = (
                    "**Why the analysis points at the data / pool layer:**\n"
                    + "\n".join(f"- {line}" for line in narrative)
                )
                if db_evidence:
                    answer += (
                        "\n\n**Evidence rows that mention DB / pool / timeouts:**\n"
                        + "\n".join(f"- {x}" for x in db_evidence[:4] if x)
                    )
            elif db_evidence:
                answer = (
                    "Database / pool involvement is supported by: "
                    + "; ".join(str(x) for x in db_evidence[:3] if x)
                    + ". Cross-check with connection-pool and timeout metrics in the timeline."
                )
            else:
                # User asked about Postgres/DB but structured evidence may only show auth/latency signals.
                ev_lines = _format_evidence_answer(analysis)
                answer = (
                    "The **saved analysis** does not name Postgres in the evidence bullets, but the narrative "
                    "still ties the incident to **connection pressure / timeouts** (often the DB pool or a "
                    "dependency behind auth). Here is what is actually on record:\n\n"
                    + ev_lines
                    + "\n\n_Ask \"What happened?\" for the root-cause narrative, or narrow to signals that "
                    "mention pool/timeouts if your telemetry uses those terms._"
                )
            sources = ["evidence", "timeline", "root_cause", "hydra.analysis"]
        elif _wants_next_steps(q):
            answer = _format_next_steps(analysis)
            sources = ["recommended_mitigation", "suggested_fix", "hydra.analysis"]
        elif _wants_narrative_explanation(q):
            answer = _format_narrative_explanation(analysis)
            sources = ["root_cause", "evidence", "blast_radius", "hydra.analysis"]
        elif "monitor" in q:
            answer = (
                "Monitor p95 latency, DB pool utilization, timeout/error rate, and retry amplification ratio for "
                f"{', '.join(analysis.get('affected_services', [])) or incident_id}."
            )
            sources = ["affected_services", "recommended_mitigation.long_term_prevention", "hydra.analysis"]
        elif "prevent" in q:
            answer = _mitigation(analysis).get(
                "long_term_prevention",
                "Introduce proactive alerts, canary rollouts, and retry circuit breakers.",
            )
            sources = ["recommended_mitigation.long_term_prevention", "hydra.analysis"]
        else:
            mit = _mitigation(analysis)
            answer = (
                "**Summary from saved analysis:**\n"
                f"- **Root cause:** {analysis.get('root_cause', 'N/A')}\n"
                f"- **Immediate action:** {mit.get('immediate_mitigation', 'N/A')}\n"
                f"- **Suggested fix:** {analysis.get('suggested_fix', 'N/A')}\n"
                "\n_Try: \"What evidence supports this?\", \"What to do next?\", or the suggested chips._"
            )
            sources = ["root_cause", "suggested_fix", "recommended_mitigation", "hydra.analysis"]

        similar = session.get("similar_incidents") or []
        if similar:
            similar_ids = ", ".join(str(i.get("id", "")) for i in similar[:2])
            if similar_ids:
                answer += f"\n\nRelated past incidents (similarity): {similar_ids}."
                sources.append("similar_incidents")

        know = self.hydradb.recall_incident_knowledge(incident_id, message, tenant_id=self.tenant_id)
        mem = self.hydradb.recall_incident_memory(incident_id, message, tenant_id=self.tenant_id)
        recall_knowledge_chunks = _recall_chunk_count(know)
        recall_memory_chunks = _recall_chunk_count(mem)
        gk = HydraDBClient.format_recall_chunks(know, "Uploaded knowledge (HydraDB)")
        gm = HydraDBClient.format_recall_chunks(mem, "Related memory (HydraDB)")
        grounding_blocks = [b for b in (gk, gm) if b]
        if grounding_blocks:
            answer = answer + "\n\n---\n\n" + "\n\n".join(grounding_blocks)
            if gk:
                sources.append("hydra.knowledge_recall")
            if gm:
                sources.append("hydra.memory_recall")

        self.hydradb.append_conversation_turn(session_id, incident_id, "user", message, self.tenant_id)
        self.hydradb.append_conversation_turn(session_id, incident_id, "assistant", answer, self.tenant_id)
        self.hydradb.store_conversation_turn(
            incident_id,
            message,
            answer,
            metadata={"session_id": session_id, "source": "IncidentIQ"},
            tenant_id=self.tenant_id,
        )

        return {
            "session_id": session_id,
            "incident_id": incident_id,
            "answer": answer,
            "sources": sources,
            "recall_knowledge_chunks": recall_knowledge_chunks,
            "recall_memory_chunks": recall_memory_chunks,
        }

    @staticmethod
    def suggested_prompts() -> List[str]:
        return list(SUGGESTED_PROMPTS)
