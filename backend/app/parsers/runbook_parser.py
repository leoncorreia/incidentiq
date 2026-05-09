from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List


def parse_runbook_file(path: Path, service: str = "uploaded-service") -> List[Dict[str, Any]]:
    content = path.read_text(encoding="utf-8")
    return [{"service": service, "content": content}]


def parse_metric_file(path: Path) -> List[Dict[str, Any]]:
    import json
    from datetime import datetime

    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, dict):
        data = [data]
    out: List[Dict[str, Any]] = []
    for item in data if isinstance(data, list) else []:
        if isinstance(item, dict):
            out.append(
                {
                    "timestamp": str(item.get("timestamp") or datetime.utcnow().replace(microsecond=0).isoformat()),
                    "service": str(item.get("service") or "uploaded-service"),
                    "metric": str(item.get("metric") or "uploaded_metric"),
                    "value": item.get("value", 0),
                    "unit": str(item.get("unit") or "count"),
                }
            )
    return out
