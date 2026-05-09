# Deploy IncidentIQ on Render (API + Web)

The repo is a monorepo: `backend/` (FastAPI) and `frontend/` (TanStack Start + **Nitro** Node server for production).

## Prerequisites

- GitHub repo connected to [Render](https://dashboard.render.com)
- Do **not** commit `backend/.env` or `frontend/.env` (gitignored)

## One-click Blueprint

1. Render Dashboard → **New** → **Blueprint**
2. Select this repository and branch (e.g. `main`)
3. **Blueprint path:** `render.yaml` (repository root)
4. Complete the flow. Render creates two web services:
   - **`incidentiq-api`** — Python / FastAPI
   - **`incidentiq-web`** — Node / Nitro (SSR + static assets)

5. When prompted, set **sync: false** variables (or add them afterward under **Environment**):

| Service           | Variable            | Value |
|------------------|---------------------|--------|
| `incidentiq-api` | `ALLOWED_ORIGINS`   | Your **web** URL, e.g. `https://incidentiq-web-xxxx.onrender.com` (no trailing slash). Comma-separate for multiple origins. |
| `incidentiq-web` | `VITE_API_URL`      | Your **API** URL, e.g. `https://incidentiq-api-xxxx.onrender.com` (no trailing slash). |

6. **Redeploy `incidentiq-web`** after setting `VITE_API_URL` so the **build** bakes the correct API base into the client bundle.

7. Optional: add `PIPESHIFT_*`, `HYDRADB_*` keys on **`incidentiq-api`** (see `backend/.env.example`).

## Smoke tests

- `GET https://<api-host>/health` → JSON with `"status":"ok"`
- Open `https://<web-host>/` and `https://<web-host>/console` — incidents should load if the API URL and CORS are correct

## Debugging on Render

- **API logs:** service `incidentiq-api` → **Logs** (look for uvicorn / Hydra / Pipeshift warnings)
- **Web logs:** `incidentiq-web` → **Logs** (Nitro / SSR errors)
- **CORS / empty incidents:** `ALLOWED_ORIGINS` on the API must **exactly** match the browser origin (scheme + host, no trailing slash). Mismatch → browser blocks `fetch`.
- **Client still calls localhost:** `VITE_API_URL` was missing at **build** time — set it and **Clear build cache & deploy** on the web service.

## Free tier

Services spin down after inactivity; first request can take ~30–60s (cold start).

## Local development

Unchanged: run API on `:10000`, `cd frontend && npm run dev` (Vite proxies `/api` → `10000` when `VITE_API_URL` is unset). See `README.md`.
