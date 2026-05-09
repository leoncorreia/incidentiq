from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

from fastapi import UploadFile

from app.parsers import (
    parse_alert_file,
    parse_deploy_file,
    parse_log_file,
    parse_metric_file,
    parse_runbook_file,
)


class IngestionService:
    def __init__(self, upload_root: Path) -> None:
        self.upload_root = upload_root

    async def ingest(self, tenant_id: str, incident_id: str, files: List[UploadFile]) -> Dict[str, Any]:
        incident_dir = self.upload_root / tenant_id / incident_id
        incident_dir.mkdir(parents=True, exist_ok=True)

        parsed: Dict[str, List[Dict[str, Any]]] = {
            "logs": [],
            "deploys": [],
            "alerts": [],
            "metrics": [],
            "runbooks": [],
        }
        uploaded_files: List[Dict[str, Any]] = []
        saved_files: List[Dict[str, Any]] = []

        for up in files:
            file_path = incident_dir / up.filename
            content = await up.read()
            file_path.write_bytes(content)
            file_kind = self._classify_file(up.filename)
            rows = self._parse_by_kind(file_kind, file_path)
            parsed[file_kind].extend(rows)
            uploaded_files.append(
                {"name": up.filename, "kind": file_kind, "size_bytes": len(content), "parsed_records": len(rows)}
            )
            saved_files.append(
                {
                    "name": up.filename,
                    "kind": file_kind,
                    "path": str(file_path.resolve()),
                    "size_bytes": len(content),
                }
            )

        return {"parsed": parsed, "uploaded_files": uploaded_files, "saved_files": saved_files}

    def _classify_file(self, filename: str) -> str:
        name = filename.lower()
        if name.endswith(".md") or "runbook" in name:
            return "runbooks"
        if "deploy" in name or name.endswith(".csv"):
            return "deploys"
        if "alert" in name:
            return "alerts"
        if "metric" in name:
            return "metrics"
        return "logs"

    def _parse_by_kind(self, kind: str, path: Path) -> List[Dict[str, Any]]:
        if kind == "runbooks":
            return parse_runbook_file(path)
        if kind == "deploys":
            return parse_deploy_file(path)
        if kind == "alerts":
            return parse_alert_file(path)
        if kind == "metrics":
            return parse_metric_file(path)
        return parse_log_file(path)
