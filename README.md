# IncidentIQ

AI-assisted incident investigation: ingest logs, deploys, alerts, and runbooks; analyze root cause; persist context with **HydraDB** (optional) and SQLite; follow-up chat grounded in operational memory.

## Layout

| Path        | Description                                      |
| ----------- | ------------------------------------------------ |
| `backend/`  | FastAPI API (`uvicorn app.main:app`)             |
| `frontend/` | TanStack Start + Vite UI                         |
| `DEPLOY.md` | **Render** blueprint (`render.yaml`): API + Nitro web |

## Local dev

**Backend** (from `backend/`):

```bash
pip install -r requirements.txt
cp .env.example .env   # add keys as needed
uvicorn app.main:app --reload --port 10000
```

**Frontend** (from `frontend/`):

```bash
npm ci
# optional: VITE_API_URL=http://localhost:10000
npm run dev
```

Open the app URL shown by Vite (e.g. `/console`).

## License / status

Portfolio / demo project — adjust for your org before production use.
