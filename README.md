# KE Studio shell

Add features by dropping module folders per repo-root [MODULE_SPEC.md](../MODULE_SPEC.md). Do not hardcode registry tables in the shell.

Runs locally. No Docker.

## One-click start (Windows)

Double-click `start.bat`, or from `ke/`:

```powershell
.\start.ps1
```

Opens Backend (:8000) and Frontend (:3000) in separate windows, then tries to open the browser.

## Layout

```
ke/
├── MODULE_SPEC.md     # points to repo-root spec
├── frontend/          # Next.js App Router
└── backend/           # FastAPI (SQLite + sync task runner by default)
```

## Backend (manual)

```powershell
cd ke/backend
pip install -r requirements.txt
$env:PYTHONPATH="."
uvicorn api.main:app --reload --port 8000
```

- OpenAPI: http://localhost:8000/openapi.json
- Health: http://localhost:8000/health
- DB default: `./data/ke.db` (SQLite)
- Celery/Redis optional; without them tasks run sync in the API process

## Frontend (manual)

```powershell
cd ke/frontend
npm install
npm run gen-types
npm run dev
```

Open http://localhost:3000

## Add a task module

1. `backend/modules/<id>/module.json` + `handler.py` (`BaseModuleHandler.run`)
2. Optional: `frontend/modules/<id>/module.json` (and Form/Result)
3. Restart uvicorn; `GET /api/modules` should list the `id`
4. Do **not** change `worker/tasks.py` if-else, nav hardcoding, or DB table schema
