from __future__ import annotations

import json
import sqlite3
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _json_dumps(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, default=str)


def _json_loads(s: str) -> Any:
    return json.loads(s)


class HydraPersistence(ABC):
    """Persistent operational memory backend (HydraDB)."""

    @abstractmethod
    def upsert_incident(self, tenant_id: str, incident_id: str, payload: Dict[str, Any], source: str) -> None: ...

    @abstractmethod
    def get_incident_payload(self, tenant_id: str, incident_id: str) -> Dict[str, Any] | None: ...

    @abstractmethod
    def list_workspace_incidents(self, tenant_id: str) -> List[Dict[str, Any]]: ...

    @abstractmethod
    def get_upload_aggregate(self, tenant_id: str, incident_id: str) -> Dict[str, Any]: ...

    @abstractmethod
    def append_upload_aggregate(
        self, tenant_id: str, incident_id: str, parsed: Dict[str, Any], files: List[Dict[str, Any]]
    ) -> None: ...

    @abstractmethod
    def clear_ranked_context(self, tenant_id: str, incident_id: str) -> None: ...

    @abstractmethod
    def get_ranked_context(self, tenant_id: str, incident_id: str) -> Dict[str, Any] | None: ...

    @abstractmethod
    def set_ranked_context(self, tenant_id: str, incident_id: str, context: Dict[str, Any]) -> None: ...

    @abstractmethod
    def upsert_session(
        self, tenant_id: str, session_id: str, incident_id: str, similar_incidents: List[Dict[str, Any]]
    ) -> None: ...

    @abstractmethod
    def get_session(self, tenant_id: str, session_id: str) -> Dict[str, Any] | None: ...

    @abstractmethod
    def append_conversation_turn(self, tenant_id: str, session_id: str, incident_id: str, role: str, content: str) -> int: ...

    @abstractmethod
    def retrieve_conversation_history(
        self, tenant_id: str, session_id: str
    ) -> List[Dict[str, Any]]: ...

    @abstractmethod
    def store_analysis_result(
        self,
        tenant_id: str,
        incident_id: str,
        session_id: str | None,
        query: str,
        analysis: Dict[str, Any],
    ) -> None: ...

    @abstractmethod
    def retrieve_latest_analysis(
        self, tenant_id: str, incident_id: str, session_id: str | None = None
    ) -> Dict[str, Any] | None: ...

    @abstractmethod
    def store_generated_runbook(
        self, tenant_id: str, incident_id: str, session_id: str | None, markdown: str
    ) -> None: ...

    @abstractmethod
    def list_generated_runbooks(self, tenant_id: str, incident_id: str, limit: int = 5) -> List[Dict[str, Any]]: ...

    @abstractmethod
    def list_incident_stubs_for_similarity(self, tenant_id: str) -> List[Dict[str, Any]]: ...

    @abstractmethod
    def get_operational_meta(self, tenant_id: str, incident_id: str) -> Dict[str, Any]:
        """Timestamps and counts for operational-memory UI."""
        ...


DDL = """
CREATE TABLE IF NOT EXISTS incidents (
  tenant_id TEXT NOT NULL,
  incident_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'workspace',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, incident_id)
);

CREATE TABLE IF NOT EXISTS upload_aggregates (
  tenant_id TEXT NOT NULL,
  incident_id TEXT NOT NULL,
  logs_json TEXT NOT NULL DEFAULT '[]',
  deploys_json TEXT NOT NULL DEFAULT '[]',
  alerts_json TEXT NOT NULL DEFAULT '[]',
  metrics_json TEXT NOT NULL DEFAULT '[]',
  runbooks_json TEXT NOT NULL DEFAULT '[]',
  files_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, incident_id)
);

CREATE TABLE IF NOT EXISTS ranked_context (
  tenant_id TEXT NOT NULL,
  incident_id TEXT NOT NULL,
  context_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, incident_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  tenant_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  incident_id TEXT NOT NULL,
  similar_incidents_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, session_id)
);

CREATE TABLE IF NOT EXISTS conversation_turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  incident_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  seq INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conv_session ON conversation_turns(tenant_id, session_id, seq);

CREATE TABLE IF NOT EXISTS analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  incident_id TEXT NOT NULL,
  session_id TEXT,
  query TEXT NOT NULL,
  analysis_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_analysis_lookup ON analyses(tenant_id, incident_id, session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS runbooks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  incident_id TEXT NOT NULL,
  session_id TEXT,
  markdown TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runbook_incident ON runbooks(tenant_id, incident_id, created_at DESC);
"""


class SqliteHydraPersistence(HydraPersistence):
    def __init__(self, db_path: Path) -> None:
        self._path = db_path
        db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(str(db_path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL;")
        self._conn.executescript(DDL)
        self._conn.commit()

    def close(self) -> None:
        self._conn.close()

    def upsert_incident(self, tenant_id: str, incident_id: str, payload: Dict[str, Any], source: str) -> None:
        now = _utc_now()
        self._conn.execute(
            """INSERT INTO incidents(tenant_id, incident_id, payload_json, source, updated_at)
               VALUES(?,?,?,?,?)
               ON CONFLICT(tenant_id, incident_id) DO UPDATE SET
                 payload_json=excluded.payload_json,
                 source=excluded.source,
                 updated_at=excluded.updated_at""",
            (tenant_id, incident_id, _json_dumps(payload), source, now),
        )
        self._conn.commit()

    def get_incident_payload(self, tenant_id: str, incident_id: str) -> Dict[str, Any] | None:
        row = self._conn.execute(
            "SELECT payload_json FROM incidents WHERE tenant_id=? AND incident_id=?",
            (tenant_id, incident_id),
        ).fetchone()
        if not row:
            return None
        return _json_loads(row["payload_json"])

    def list_workspace_incidents(self, tenant_id: str) -> List[Dict[str, Any]]:
        rows = self._conn.execute(
            "SELECT payload_json FROM incidents WHERE tenant_id=? AND source='workspace' ORDER BY updated_at DESC",
            (tenant_id,),
        ).fetchall()
        return [_json_loads(r["payload_json"]) for r in rows]

    def get_upload_aggregate(self, tenant_id: str, incident_id: str) -> Dict[str, Any]:
        row = self._conn.execute(
            "SELECT * FROM upload_aggregates WHERE tenant_id=? AND incident_id=?",
            (tenant_id, incident_id),
        ).fetchone()
        if not row:
            return {
                "logs": [],
                "deploys": [],
                "alerts": [],
                "metrics": [],
                "runbooks": [],
                "files": [],
            }
        return {
            "logs": _json_loads(row["logs_json"]),
            "deploys": _json_loads(row["deploys_json"]),
            "alerts": _json_loads(row["alerts_json"]),
            "metrics": _json_loads(row["metrics_json"]),
            "runbooks": _json_loads(row["runbooks_json"]),
            "files": _json_loads(row["files_json"]),
        }

    def append_upload_aggregate(
        self, tenant_id: str, incident_id: str, parsed: Dict[str, Any], files: List[Dict[str, Any]]
    ) -> None:
        agg = self.get_upload_aggregate(tenant_id, incident_id)
        for key in ["logs", "deploys", "alerts", "metrics", "runbooks"]:
            agg[key].extend(parsed.get(key, []))
        agg["files"].extend(files)
        now = _utc_now()
        self._conn.execute(
            """INSERT INTO upload_aggregates(
                 tenant_id, incident_id, logs_json, deploys_json, alerts_json,
                 metrics_json, runbooks_json, files_json, updated_at)
               VALUES(?,?,?,?,?,?,?,?,?)
               ON CONFLICT(tenant_id, incident_id) DO UPDATE SET
                 logs_json=excluded.logs_json,
                 deploys_json=excluded.deploys_json,
                 alerts_json=excluded.alerts_json,
                 metrics_json=excluded.metrics_json,
                 runbooks_json=excluded.runbooks_json,
                 files_json=excluded.files_json,
                 updated_at=excluded.updated_at""",
            (
                tenant_id,
                incident_id,
                _json_dumps(agg["logs"]),
                _json_dumps(agg["deploys"]),
                _json_dumps(agg["alerts"]),
                _json_dumps(agg["metrics"]),
                _json_dumps(agg["runbooks"]),
                _json_dumps(agg["files"]),
                now,
            ),
        )
        self._conn.commit()
        self.clear_ranked_context(tenant_id, incident_id)

    def clear_ranked_context(self, tenant_id: str, incident_id: str) -> None:
        self._conn.execute(
            "DELETE FROM ranked_context WHERE tenant_id=? AND incident_id=?",
            (tenant_id, incident_id),
        )
        self._conn.commit()

    def get_ranked_context(self, tenant_id: str, incident_id: str) -> Dict[str, Any] | None:
        row = self._conn.execute(
            "SELECT context_json FROM ranked_context WHERE tenant_id=? AND incident_id=?",
            (tenant_id, incident_id),
        ).fetchone()
        if not row:
            return None
        return _json_loads(row["context_json"])

    def set_ranked_context(self, tenant_id: str, incident_id: str, context: Dict[str, Any]) -> None:
        now = _utc_now()
        self._conn.execute(
            """INSERT INTO ranked_context(tenant_id, incident_id, context_json, updated_at)
               VALUES(?,?,?,?)
               ON CONFLICT(tenant_id, incident_id) DO UPDATE SET
                 context_json=excluded.context_json,
                 updated_at=excluded.updated_at""",
            (tenant_id, incident_id, _json_dumps(context), now),
        )
        self._conn.commit()

    def upsert_session(
        self, tenant_id: str, session_id: str, incident_id: str, similar_incidents: List[Dict[str, Any]]
    ) -> None:
        now = _utc_now()
        existing = self._conn.execute(
            "SELECT session_id FROM sessions WHERE tenant_id=? AND session_id=?",
            (tenant_id, session_id),
        ).fetchone()
        if existing:
            self._conn.execute(
                """UPDATE sessions SET incident_id=?, similar_incidents_json=?, updated_at=?
                   WHERE tenant_id=? AND session_id=?""",
                (incident_id, _json_dumps(similar_incidents), now, tenant_id, session_id),
            )
        else:
            self._conn.execute(
                """INSERT INTO sessions(tenant_id, session_id, incident_id, similar_incidents_json, created_at, updated_at)
                   VALUES(?,?,?,?,?,?)""",
                (tenant_id, session_id, incident_id, _json_dumps(similar_incidents), now, now),
            )
        self._conn.commit()

    def get_session(self, tenant_id: str, session_id: str) -> Dict[str, Any] | None:
        row = self._conn.execute(
            "SELECT * FROM sessions WHERE tenant_id=? AND session_id=?",
            (tenant_id, session_id),
        ).fetchone()
        if not row:
            return None
        return {
            "tenant_id": row["tenant_id"],
            "session_id": row["session_id"],
            "incident_id": row["incident_id"],
            "similar_incidents": _json_loads(row["similar_incidents_json"]),
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    def append_conversation_turn(
        self, tenant_id: str, session_id: str, incident_id: str, role: str, content: str
    ) -> int:
        row = self._conn.execute(
            "SELECT COALESCE(MAX(seq), -1) AS m FROM conversation_turns WHERE tenant_id=? AND session_id=?",
            (tenant_id, session_id),
        ).fetchone()
        seq = int(row["m"]) + 1
        now = _utc_now()
        self._conn.execute(
            """INSERT INTO conversation_turns(tenant_id, session_id, incident_id, role, content, seq, created_at)
               VALUES(?,?,?,?,?,?,?)""",
            (tenant_id, session_id, incident_id, role, content, seq, now),
        )
        self._conn.commit()
        return seq

    def retrieve_conversation_history(self, tenant_id: str, session_id: str) -> List[Dict[str, Any]]:
        rows = self._conn.execute(
            """SELECT role, content, seq FROM conversation_turns
               WHERE tenant_id=? AND session_id=? ORDER BY seq ASC""",
            (tenant_id, session_id),
        ).fetchall()
        return [{"role": r["role"], "content": r["content"], "seq": r["seq"]} for r in rows]

    def store_analysis_result(
        self,
        tenant_id: str,
        incident_id: str,
        session_id: str | None,
        query: str,
        analysis: Dict[str, Any],
    ) -> None:
        now = _utc_now()
        self._conn.execute(
            """INSERT INTO analyses(tenant_id, incident_id, session_id, query, analysis_json, created_at)
               VALUES(?,?,?,?,?,?)""",
            (tenant_id, incident_id, session_id, query, _json_dumps(analysis), now),
        )
        self._conn.commit()

    def retrieve_latest_analysis(
        self, tenant_id: str, incident_id: str, session_id: str | None = None
    ) -> Dict[str, Any] | None:
        if session_id:
            row = self._conn.execute(
                """SELECT analysis_json FROM analyses
                   WHERE tenant_id=? AND incident_id=? AND session_id=?
                   ORDER BY created_at DESC LIMIT 1""",
                (tenant_id, incident_id, session_id),
            ).fetchone()
        else:
            row = self._conn.execute(
                """SELECT analysis_json FROM analyses
                   WHERE tenant_id=? AND incident_id=?
                   ORDER BY created_at DESC LIMIT 1""",
                (tenant_id, incident_id),
            ).fetchone()
        if not row:
            return None
        return _json_loads(row["analysis_json"])

    def store_generated_runbook(
        self, tenant_id: str, incident_id: str, session_id: str | None, markdown: str
    ) -> None:
        now = _utc_now()
        self._conn.execute(
            """INSERT INTO runbooks(tenant_id, incident_id, session_id, markdown, created_at)
               VALUES(?,?,?,?,?)""",
            (tenant_id, incident_id, session_id, markdown, now),
        )
        self._conn.commit()

    def list_generated_runbooks(self, tenant_id: str, incident_id: str, limit: int = 5) -> List[Dict[str, Any]]:
        rows = self._conn.execute(
            """SELECT id, session_id, markdown, created_at FROM runbooks
               WHERE tenant_id=? AND incident_id=? ORDER BY created_at DESC LIMIT ?""",
            (tenant_id, incident_id, limit),
        ).fetchall()
        return [
            {"id": r["id"], "session_id": r["session_id"], "markdown": r["markdown"], "created_at": r["created_at"]}
            for r in rows
        ]

    def list_incident_stubs_for_similarity(self, tenant_id: str) -> List[Dict[str, Any]]:
        rows = self._conn.execute(
            "SELECT incident_id, payload_json FROM incidents WHERE tenant_id=?",
            (tenant_id,),
        ).fetchall()
        out: List[Dict[str, Any]] = []
        for r in rows:
            p = _json_loads(r["payload_json"])
            out.append(
                {
                    "id": p.get("id", r["incident_id"]),
                    "service": p.get("service", ""),
                    "tags": p.get("tags") or [],
                    "title": p.get("title", ""),
                }
            )
        return out

    def get_operational_meta(self, tenant_id: str, incident_id: str) -> Dict[str, Any]:
        upload = self.get_upload_aggregate(tenant_id, incident_id)
        artifact_count = len(upload.get("files") or [])
        row = self._conn.execute(
            """SELECT created_at FROM analyses WHERE tenant_id=? AND incident_id=?
               ORDER BY created_at DESC LIMIT 1""",
            (tenant_id, incident_id),
        ).fetchone()
        turns_row = self._conn.execute(
            """SELECT COUNT(*) AS c FROM conversation_turns WHERE tenant_id=? AND incident_id=?""",
            (tenant_id, incident_id),
        ).fetchone()
        followups = int(turns_row["c"]) if turns_row else 0
        return {
            "has_analysis": row is not None,
            "last_analysis_at": row["created_at"] if row else None,
            "uploaded_artifact_count": artifact_count,
            "followup_turn_count": followups,
        }


class InMemoryHydraPersistence(HydraPersistence):
    """Fallback when SQLite is unavailable — not durable across restarts."""

    def __init__(self) -> None:
        self._incidents: Dict[str, Dict[str, Dict[str, Any]]] = {}
        self._uploads: Dict[str, Dict[str, Dict[str, Any]]] = {}
        self._ranked: Dict[str, Dict[str, Dict[str, Any]]] = {}
        self._sessions: Dict[str, Dict[str, Dict[str, Any]]] = {}
        self._turns: Dict[str, Dict[str, List[Dict[str, Any]]]] = {}
        self._analyses: Dict[str, List[Dict[str, Any]]] = {}
        self._runbooks: Dict[str, List[Dict[str, Any]]] = {}

    def _tk(self, tenant_id: str, incident_id: str) -> str:
        return f"{tenant_id}::{incident_id}"

    def upsert_incident(self, tenant_id: str, incident_id: str, payload: Dict[str, Any], source: str) -> None:
        self._incidents.setdefault(tenant_id, {})[incident_id] = {
            "payload": dict(payload),
            "source": source,
            "updated_at": _utc_now(),
        }

    def get_incident_payload(self, tenant_id: str, incident_id: str) -> Dict[str, Any] | None:
        row = self._incidents.get(tenant_id, {}).get(incident_id)
        return dict(row["payload"]) if row else None

    def list_workspace_incidents(self, tenant_id: str) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        for iid, row in self._incidents.get(tenant_id, {}).items():
            if row["source"] == "workspace":
                out.append(dict(row["payload"]))
        out.sort(key=lambda r: str(r.get("started_at", "")), reverse=True)
        return out

    def get_upload_aggregate(self, tenant_id: str, incident_id: str) -> Dict[str, Any]:
        return self._uploads.get(tenant_id, {}).get(
            incident_id,
            {
                "logs": [],
                "deploys": [],
                "alerts": [],
                "metrics": [],
                "runbooks": [],
                "files": [],
            },
        )

    def append_upload_aggregate(
        self, tenant_id: str, incident_id: str, parsed: Dict[str, Any], files: List[Dict[str, Any]]
    ) -> None:
        agg = dict(self.get_upload_aggregate(tenant_id, incident_id))
        for key in ["logs", "deploys", "alerts", "metrics", "runbooks"]:
            agg[key] = list(agg[key])
            agg[key].extend(parsed.get(key, []))
        agg["files"] = list(agg["files"]) + list(files)
        self._uploads.setdefault(tenant_id, {})[incident_id] = agg
        self.clear_ranked_context(tenant_id, incident_id)

    def clear_ranked_context(self, tenant_id: str, incident_id: str) -> None:
        self._ranked.get(tenant_id, {}).pop(incident_id, None)

    def get_ranked_context(self, tenant_id: str, incident_id: str) -> Dict[str, Any] | None:
        return self._ranked.get(tenant_id, {}).get(incident_id)

    def set_ranked_context(self, tenant_id: str, incident_id: str, context: Dict[str, Any]) -> None:
        self._ranked.setdefault(tenant_id, {})[incident_id] = dict(context)

    def upsert_session(
        self, tenant_id: str, session_id: str, incident_id: str, similar_incidents: List[Dict[str, Any]]
    ) -> None:
        now = _utc_now()
        bucket = self._sessions.setdefault(tenant_id, {})
        if session_id in bucket:
            bucket[session_id]["incident_id"] = incident_id
            bucket[session_id]["similar_incidents"] = list(similar_incidents)
            bucket[session_id]["updated_at"] = now
        else:
            bucket[session_id] = {
                "incident_id": incident_id,
                "similar_incidents": list(similar_incidents),
                "created_at": now,
                "updated_at": now,
            }

    def get_session(self, tenant_id: str, session_id: str) -> Dict[str, Any] | None:
        s = self._sessions.get(tenant_id, {}).get(session_id)
        if not s:
            return None
        return {
            "tenant_id": tenant_id,
            "session_id": session_id,
            "incident_id": s["incident_id"],
            "similar_incidents": s["similar_incidents"],
            "created_at": s["created_at"],
            "updated_at": s["updated_at"],
        }

    def append_conversation_turn(
        self, tenant_id: str, session_id: str, incident_id: str, role: str, content: str
    ) -> int:
        turns = self._turns.setdefault(tenant_id, {}).setdefault(session_id, [])
        seq = len(turns)
        turns.append(
            {"role": role, "content": content, "seq": seq, "created_at": _utc_now(), "incident_id": incident_id}
        )
        return seq

    def retrieve_conversation_history(self, tenant_id: str, session_id: str) -> List[Dict[str, Any]]:
        turns = self._turns.get(tenant_id, {}).get(session_id, [])
        return [{"role": t["role"], "content": t["content"], "seq": t["seq"]} for t in turns]

    def store_analysis_result(
        self,
        tenant_id: str,
        incident_id: str,
        session_id: str | None,
        query: str,
        analysis: Dict[str, Any],
    ) -> None:
        key = self._tk(tenant_id, incident_id)
        self._analyses.setdefault(key, []).append(
            {
                "session_id": session_id,
                "query": query,
                "analysis": dict(analysis),
                "created_at": _utc_now(),
            }
        )

    def retrieve_latest_analysis(
        self, tenant_id: str, incident_id: str, session_id: str | None = None
    ) -> Dict[str, Any] | None:
        key = self._tk(tenant_id, incident_id)
        rows = list(self._analyses.get(key, []))
        if session_id:
            rows = [r for r in rows if r["session_id"] == session_id]
        if not rows:
            return None
        rows.sort(key=lambda r: r["created_at"], reverse=True)
        return rows[0]["analysis"]

    def store_generated_runbook(
        self, tenant_id: str, incident_id: str, session_id: str | None, markdown: str
    ) -> None:
        key = self._tk(tenant_id, incident_id)
        self._runbooks.setdefault(key, []).append(
            {"session_id": session_id, "markdown": markdown, "created_at": _utc_now()}
        )

    def list_generated_runbooks(self, tenant_id: str, incident_id: str, limit: int = 5) -> List[Dict[str, Any]]:
        key = self._tk(tenant_id, incident_id)
        rows = list(self._runbooks.get(key, []))
        rows.sort(key=lambda r: r["created_at"], reverse=True)
        return [{"id": i, "markdown": r["markdown"], "session_id": r["session_id"], "created_at": r["created_at"]} for i, r in enumerate(rows[:limit])]

    def list_incident_stubs_for_similarity(self, tenant_id: str) -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        for iid, row in self._incidents.get(tenant_id, {}).items():
            p = row["payload"]
            out.append(
                {
                    "id": p.get("id", iid),
                    "service": p.get("service", ""),
                    "tags": p.get("tags") or [],
                    "title": p.get("title", ""),
                }
            )
        return out

    def get_operational_meta(self, tenant_id: str, incident_id: str) -> Dict[str, Any]:
        upload = self.get_upload_aggregate(tenant_id, incident_id)
        artifact_count = len(upload.get("files") or [])
        key = self._tk(tenant_id, incident_id)
        rows = list(self._analyses.get(key, []))
        rows.sort(key=lambda r: r["created_at"], reverse=True)
        last_at = rows[0]["created_at"] if rows else None
        followups = 0
        for sess_turns in self._turns.get(tenant_id, {}).values():
            for t in sess_turns:
                if t.get("incident_id") == incident_id:
                    followups += 1
        return {
            "has_analysis": bool(rows),
            "last_analysis_at": last_at,
            "uploaded_artifact_count": artifact_count,
            "followup_turn_count": followups,
        }


def open_hydra_persistence(db_path: Path) -> HydraPersistence:
    try:
        return SqliteHydraPersistence(db_path)
    except (sqlite3.Error, OSError):
        return InMemoryHydraPersistence()
