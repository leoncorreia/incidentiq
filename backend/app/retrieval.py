from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Union

KEYWORDS = {"latency", "timeout", "connection", "pool", "retry", "error", "spike"}


def _parse_started_at(value: Union[str, datetime]) -> datetime:
    if isinstance(value, datetime):
        return value
    s = str(value).replace("Z", "+00:00")
    return datetime.fromisoformat(s)


def _load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _load_jsonl(path: Path) -> List[Dict[str, Any]]:
    if not path.exists():
        return []
    rows: List[Dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def filter_logs_by_time_and_service(
    logs: List[Dict[str, Any]],
    time_range: tuple[datetime, datetime],
    services: List[str],
) -> List[Dict[str, Any]]:
    start, end = time_range
    services_set = set(services)
    filtered: List[Dict[str, Any]] = []
    for entry in logs:
        ts = datetime.fromisoformat(entry["timestamp"])
        if start <= ts <= end and entry.get("service") in services_set:
            filtered.append(entry)
    return filtered


def rank_events_by_relevance(context: Dict[str, Any], query: str) -> Dict[str, Any]:
    query_terms = {term.lower() for term in query.replace("?", "").split()}

    def score_event(event: Dict[str, Any], text_fields: List[str]) -> int:
        text = " ".join(str(event.get(field, "")).lower() for field in text_fields)
        keyword_hits = sum(1 for k in KEYWORDS if k in text)
        query_hits = sum(1 for q in query_terms if q in text)
        error_bonus = 3 if str(event.get("level", "")).upper() == "ERROR" else 0
        return keyword_hits + query_hits + error_bonus

    logs = sorted(
        context["logs"],
        key=lambda e: score_event(e, ["message", "service", "level"]),
        reverse=True,
    )
    alerts = sorted(
        context["alerts"],
        key=lambda e: score_event(e, ["alert", "service", "severity"]),
        reverse=True,
    )
    deploys = sorted(
        context["deploys"],
        key=lambda e: score_event(e, ["change", "service", "version"]),
        reverse=True,
    )
    metrics = sorted(
        context["metrics"],
        key=lambda e: score_event(e, ["metric", "value", "service"]),
        reverse=True,
    )
    context["logs"] = logs[:12]
    context["alerts"] = alerts[:6]
    context["deploys"] = deploys[:6]
    context["metrics"] = metrics[:10]
    return context


def get_incident_metadata(incident_id: str, data_dir: Path) -> Dict[str, Any]:
    """Incident row from incidents.json only (no seed logs/deploys/alerts/metrics/runbooks)."""
    incidents = _load_json(data_dir / "incidents.json")
    incident = next((x for x in incidents if x["id"] == incident_id), None)
    if incident is None:
        raise ValueError(f"Incident '{incident_id}' not found")
    return incident


def get_incident_context(incident_id: str, data_dir: Path, incident_row: Dict[str, Any] | None = None) -> Dict[str, Any]:
    incident = incident_row if incident_row is not None else get_incident_metadata(incident_id, data_dir)

    started = _parse_started_at(incident["started_at"])
    start = started - timedelta(minutes=15)
    end = started + timedelta(minutes=30)
    services = incident.get("related_services", [incident["service"]])

    logs = _load_jsonl(data_dir / "logs" / f"{incident_id}.jsonl")
    deploys = _load_json(data_dir / "deploys.json")
    alerts = _load_json(data_dir / "alerts.json")
    metrics = _load_json(data_dir / "metrics.json")
    runbook_path = data_dir / "runbooks" / f"{incident['service']}.md"
    runbook = runbook_path.read_text(encoding="utf-8") if runbook_path.exists() else ""

    scoped_logs = filter_logs_by_time_and_service(logs, (start, end), services)
    scoped_deploys = [
        d for d in deploys if d["service"] in services and start.isoformat() <= d["timestamp"] <= end.isoformat()
    ]
    scoped_alerts = [
        a for a in alerts if a["service"] in services and start.isoformat() <= a["timestamp"] <= end.isoformat()
    ]
    scoped_metrics = [
        m for m in metrics if m["service"] in services and start.isoformat() <= m["timestamp"] <= end.isoformat()
    ]

    context = {
        "incident": incident,
        "logs": scoped_logs,
        "deploys": scoped_deploys,
        "alerts": scoped_alerts,
        "metrics": scoped_metrics,
        "runbooks": [{"service": incident["service"], "content": runbook}],
    }
    return context
