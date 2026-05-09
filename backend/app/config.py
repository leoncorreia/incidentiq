from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import List

from dotenv import load_dotenv
from pydantic import BaseModel, Field

# Resolve `backend/.env` even when the process cwd is the repo root or another folder.
_BACKEND_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(_BACKEND_ROOT / ".env")


class Settings(BaseModel):
    pipeshift_api_key: str | None = Field(default_factory=lambda: os.getenv("PIPESHIFT_API_KEY"))
    pipeshift_model: str = Field(default_factory=lambda: os.getenv("PIPESHIFT_MODEL", "gpt-4o-mini"))
    pipeshift_api_url: str = Field(
        default_factory=lambda: os.getenv("PIPESHIFT_API_URL", "https://api.openai.com/v1/chat/completions")
    )
    hydradb_api_key: str | None = Field(default_factory=lambda: os.getenv("HYDRADB_API_KEY"))
    hydradb_tenant: str = Field(default_factory=lambda: os.getenv("HYDRADB_TENANT", "incidentiq-demo"))
    hydradb_tenant_id: str | None = Field(default_factory=lambda: os.getenv("HYDRADB_TENANT_ID"))
    hydradb_base_url: str = Field(
        default_factory=lambda: os.getenv("HYDRADB_BASE_URL", "https://api.hydradb.com").rstrip("/")
    )
    hydradb_store_path: str | None = Field(default_factory=lambda: os.getenv("HYDRADB_STORE_PATH"))
    allowed_origins: List[str] = Field(default_factory=list)

    @classmethod
    def from_env(cls) -> "Settings":
        raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000")
        origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]
        return cls(allowed_origins=origins)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings.from_env()
