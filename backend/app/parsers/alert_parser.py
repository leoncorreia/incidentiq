from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List


def parse_alert_file(path: Path) -> List[Dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, dict):
        data = [data]
    out: List[Dict[str, Any]] = []
    for item in data if isinstance(data, list) else []:
        if isinstance(item, dict):
            out.append(
                {
                    "timestamp": str(item.get("timestamp") or _now_iso()),
                    "service": str(item.get("service") or "uploaded-service"),
                    "alert": str(item.get("alert") or item.get("message") or "Uploaded alert"),
                    "severity": str(item.get("severity") or "medium"),
                }
            )
    return out


def _now_iso() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat()
