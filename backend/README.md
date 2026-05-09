# IncidentIQ Backend

FastAPI backend for IncidentIQ incident reasoning MVP.

## Features
- `/health`, `/incidents`, `/incident/{id}`, `/analyze`
- **HydraDB Cloud** (optional): official [`hydra-db-python`](https://docs.hydradb.com/) SDK — uploaded files go to the **knowledge base**; analysis summaries, runbooks, and chat turns go to **user memory**; follow-ups use `full_recall` + `recall_preferences` for grounding
- **Local Hydra layer** (SQLite `data/hydradb.sqlite` by default): persistent uploads, ranked context snapshots, analyses, chat turns, generated runbooks, workspace incidents; in-memory fallback if the DB cannot open
- Retrieval pipeline over incident metadata, logs (JSONL), deploys, alerts, metrics, and runbooks
- Modular architecture:
  - API (`app/main.py`)
  - Orchestrator (`app/orchestrator.py`)
  - Retrieval (`app/retrieval.py`)
  - Context layer (`app/hydradb_client.py`)
  - Model layer (`app/pipeshift_client.py`)

## Local Run
1. Create venv and install:
   - `pip install -r requirements.txt`
2. Copy env file:
   - `cp .env.example .env`
   - set `PIPESHIFT_API_KEY` on hackathon day to enable live LLM analysis
   - optionally set `PIPESHIFT_API_URL` and `PIPESHIFT_MODEL` for your provider
   - **HydraDB Cloud** (persistent operational context across restarts):
     - `HYDRADB_API_KEY` — API key from the HydraDB console
     - `HYDRADB_TENANT_ID` — your HydraDB tenant id (maps to SDK `tenant_id`)
     - `HYDRADB_BASE_URL` — defaults to `https://api.hydradb.com` if unset
     - `HYDRADB_TENANT` — IncidentIQ workspace routing key for local SQLite (defaults to `incidentiq-demo`); if `HYDRADB_TENANT_ID` is omitted, the same value is used as the HydraDB cloud tenant id
3. Start API:
   - `uvicorn app.main:app --reload --port 10000`

If `PIPESHIFT_API_KEY` is missing or the model call fails, the backend falls back to deterministic local reasoning for demo continuity.

### Verifying HydraDB Cloud vs SQLite fallback
- **Cloud active**: API responses include `hydra_context_status` with the text `HydraDB Cloud active`, and `hydra_context_layer` / upload responses use `hydra_cloud`. On follow-up chat, logs show `HydraDB recall returned N chunks`.
- **Fallback**: If `HYDRADB_API_KEY` or `HYDRADB_BASE_URL` is missing, the SDK is unavailable, or API calls fail, logs include `Using SQLite fallback` and `hydra_context_status` explains cloud is offline. Upload/analysis/chat still work via SQLite (or in-memory if the DB file cannot be opened).
- **Resume**: `POST /chat/start` returns `hydradb_resume` with JSON-safe snapshots of HydraDB-listed knowledge and memories when cloud is configured (sub-tenant = `tenant_id:incident_id`).

## Demo Query
`POST /analyze`
```json
{
  "incident_id": "inc_001",
  "query": "Why did latency spike at 2:17 PM?"
}
```

## Deploy
- Render config: `render.yaml`
- Docker image support: `Dockerfile`
