from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List


def parse_log_file(path: Path) -> List[Dict[str, Any]]:
    ext = path.suffix.lower()
    if ext == ".jsonl":
        return _parse_jsonl(path)
    if ext == ".json":
        return _parse_json(path)
    return _parse_text_lines(path)


def _parse_jsonl(path: Path) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                raw = json.loads(line)
                if isinstance(raw, dict):
                    out.append(
                        {
                            "timestamp": str(raw.get("timestamp") or _now_iso()),
                            "service": str(raw.get("service") or "uploaded-service"),
                            "level": str(raw.get("level") or "INFO"),
                            "message": str(raw.get("message") or line),
                            "trace_id": raw.get("trace_id"),
                        }
                    )
                else:
                    out.append(_text_to_log(line))
            except Exception:
                out.append(_text_to_log(line))
    return out


def _parse_json(path: Path) -> List[Dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    rows: List[Dict[str, Any]] = []
    if isinstance(data, dict):
        data = [data]
    for item in data if isinstance(data, list) else []:
        if isinstance(item, dict):
            rows.append(
                {
                    "timestamp": str(item.get("timestamp") or _now_iso()),
                    "service": str(item.get("service") or "uploaded-service"),
                    "level": str(item.get("level") or "INFO"),
                    "message": str(item.get("message") or json.dumps(item, ensure_ascii=True)),
                    "trace_id": item.get("trace_id"),
                }
            )
    return rows


def _parse_text_lines(path: Path) -> List[Dict[str, Any]]:
    return [_text_to_log(line.strip()) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def _text_to_log(line: str) -> Dict[str, Any]:
    return {
        "timestamp": _now_iso(),
        "service": "uploaded-service",
        "level": "INFO",
        "message": line,
        "trace_id": None,
    }


def _now_iso() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat()
