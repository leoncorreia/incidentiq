# IncidentIQ — demo recording guide

Use this as a **shot list + narration script**. Target **4–7 minutes** for a tight demo; **10–12 minutes** if you add uploads and a second incident.

---

## Before you hit record

1. **Environment**
   - Prefer your **deployed** Render URLs (web + API) so the story is “real product,” not “my laptop.”
   - Confirm **`ALLOWED_ORIGINS`** matches the web URL and **`VITE_API_URL`** is set (rebuild web if you changed it).
   - Set **`PIPESHIFT_API_KEY`** on the API if you want the narrated line: “follow-ups are answered by the model from saved analysis and memory.” Without it, say “analysis uses the deterministic fallback” and still show the UI.

2. **Browser**
   - 1920×1080 or 1440×900 window, **100% zoom**, one tab visible.
   - Close notifs; optional **Incognito** so extensions don’t clutter.

3. **Privacy**
   - Don’t show `.env`, API keys, or Hydra keys. Blur if you open Render dashboard.

4. **Dry run once** — click through the same path below so transitions feel smooth.

---

## What to show (checklist)

| # | What | Why it matters |
|---|------|----------------|
| 1 | Home → link to **Console** | Product entry |
| 2 | **Incident list** + select one | Workspace / seed data |
| 3 | Status line / Hydra / memory hints (top or panels) | Operational memory story |
| 4 | **Investigation question** → run **analysis** | Core value: grounded RC |
| 5 | **Root cause** panel: timeline, evidence, mitigations, graph if visible | Rich output |
| 6 | **Operational memory** / context panel if present | Persistence |
| 7 | **Follow-up chat** — question that references the *last* answer (e.g. “Why would Postgres be involved?” or “What evidence supports that?”) | Shows relevance + recall |
| 8 | (Optional) **Upload** a small log file → short re-analysis or context | Ingest story |
| 9 | (Optional) **Second incident** or refresh — show list + resume badges | Scale / return visit |
| 10 | Closing: one sentence **who it’s for** + **GitHub / Render** | CTA |

---

## Narration script (read or paraphrase)

### 0:00 — Hook (5–10 sec)

**Say:**  
“This is **IncidentIQ** — a small demo app for **AI-assisted incident investigation**: you bring alerts, deploys, logs, and runbooks, ask a question, get a structured root-cause style analysis, then **follow up in chat** with answers grounded in what was saved and in **operational memory**.”

**Show:** Browser on your **deployed** home page or `/console`.

---

### 0:15 — Open the console (15–20 sec)

**Say:**  
“I’ll open the **console**. Here’s the **incident list** — these are workspace incidents backed by the API; I’ll pick one that has enough context for a meaningful analysis.”

**Show:** Navigate to **`/console`**, click **one incident** so the main workspace loads.

---

### 0:35 — Set the question (20–30 sec)

**Say:**  
“Investigators don’t start from a blank page — they start from a **question**. I’ll ask something specific tied to this incident, for example what caused a spike or an error pattern, and run **analysis**.”

**Show:** Type a **concrete** question (use wording that matches your seed data, e.g. latency spike, token validation, checkout). Click **Analyze** / submit (whatever your UI labels it). Wait for the result — **don’t talk over a long spinner**; cut or speed up in edit if needed.

---

### 1:00 — Walk the analysis (45–60 sec)

**Say:**  
“The response is structured: **root cause**, **evidence**, **timeline**, **blast radius**, and **mitigations** — immediate, short-term, long-term. That’s intentional so you can paste into a ticket or a postmortem doc. If there’s a **graph**, it’s a quick mental model of what touched what.”

**Show:** Scroll **Root cause** / analysis panel; point cursor at **evidence** and **timeline**; briefly show **mitigations**.

---

### 1:45 — Operational memory (30–45 sec)

**Say:**  
“The important bit for a demo is **persistence**. Analysis and chat aren’t throwaway — they’re tied to **operational memory** — here via **HydraDB** when configured, with a **local SQLite** path for dev. The UI surfaces that so you know context will **survive refreshes** and can be **recalled** on follow-up.”

**Show:** **Operational memory** panel, context / Hydra status, or any **restored context** banner if it appears.

---

### 2:15 — Follow-up chat (45–75 sec)

**Say:**  
“Now the investigator asks a **follow-up** — not a new analysis, but a drill-down on the same incident. I’ll ask something that **only makes sense** after the first answer — for example why a database or Postgres might be involved, or what evidence backs a claim. The reply should **directly address the question** using the **saved analysis** and **recall**, not generic filler.”

**Show:** Type follow-up in **chat**; send; read the answer on screen (brief pause). If you use **LLM** on the API, mention that; if not, say follow-ups still use **saved analysis + rules**.

---

### 3:15 — Optional: upload (60–90 sec)

**Say:**  
“You can also **ingest** extra context — for example a log export — so the next analysis or retrieval can use it. I’ll upload a small file and show that the app still ties back to the incident.”

**Show:** Upload UI → one **small** `.txt` or `.log` → optional short follow-up or note in UI that knowledge was added. **Skip** if flaky on your deploy.

---

### 3:45 — Close (20–30 sec)

**Say:**  
“That’s IncidentIQ: **question-driven analysis**, **structured output**, **chat follow-up** grounded in **saved state and memory**, and optional **uploads**. Code and **Render** deployment are in the repo — link in the description.”

**Show:** Static frame on console or GitHub README; end card optional.

---

## B-roll / extras (if you need padding)

- **`GET /health`** in a second window (API alive, optional `hydra_cloud_active`-style fields if you show JSON).
- **Render** dashboard: two services — **API** + **web** — no secrets visible.
- **Second incident**: switch item in list; mention **session / memory** is per workspace.

---

## Recording tools (pick one)

- **OBS Studio** (free): Display Capture + mic; output MP4.
- **Windows**: Win + G (Xbox Game Bar) → record.
- **macOS**: QuickTime → New Screen Recording.

**Tip:** Record **system audio off** unless you want UI sounds; use a **decent mic** and normalize in edit.

---

## One-line pitch (thumbnail / title)

**Title idea:** *IncidentIQ — AI incident analysis with persistent operational memory*  
**Subtitle:** *Structured root cause + follow-up chat (HydraDB / SQLite) on Render*
