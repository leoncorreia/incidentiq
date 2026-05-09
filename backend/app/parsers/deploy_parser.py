from __future__ import annotations

import csv
import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List


def parse_deploy_file(path: Path) -> List[Dict[str, Any]]:
    ext = path.suffix.lower()
    if ext == ".csv":
        return _parse_csv(path)
    return _parse_json(path)


def _parse_csv(path: Path) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append(
                {
                    "timestamp": str(r.get("timestamp") or _now_iso()),
                    "service": str(r.get("service") or "uploaded-service"),
                    "version": str(r.get("version") or "unknown"),
                    "change": str(r.get("change") or "Uploaded deploy change"),
                }
            )
    return rows


def _parse_json(path: Path) -> List[Dict[str, Any]]:
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
                    "version": str(item.get("version") or "unknown"),
                    "change": str(item.get("change") or json.dumps(item, ensure_ascii=True)),
                }
            )
    return out


def _now_iso() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat()
