# Deploy IncidentIQ (standalone repo)

## 1. GitHub

This repository root contains `backend/` and `frontend/`.

```bash
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/<you>/incidentiq.git
git push -u origin main
```

Do not commit `backend/.env` or `frontend/.env.local` (they are gitignored).

## 2. Render — API (FastAPI)

1. [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint** (or **Web Service**).
2. Connect this **incidentiq** GitHub repo, branch `main`.
3. **Blueprint path:** `backend/render.yaml`  
   - **Web Service** alternative: **Root Directory** = `backend`, **Build** = `pip install -r requirements.txt`, **Start** = `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
4. After deploy → **Environment**:
   - **ALLOWED_ORIGINS** — production frontend URL(s), comma-separated, e.g. `https://your-app.vercel.app`
   - **PIPESHIFT_***, **HYDRADB_*** as needed (see `backend/.env.example`).

**Health check:** `GET /health`

## 3. Frontend

Deploy `frontend/` to Vercel, Cloudflare Pages, etc. Set at **build** time:

- `VITE_API_URL` = `https://<your-render-service>.onrender.com` (no trailing slash)

## 4. Smoke test

- Browser: frontend loads; API calls hit Render, not `localhost:10000`.
- `GET https://<render-host>/health` → `{"status":"ok",...}`.
