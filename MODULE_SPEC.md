# MODULE_SPEC.md

> **Canonical spec:** [../MODULE_SPEC.md](../MODULE_SPEC.md)  
> Do not maintain field definitions here. ke shell (`_registry` / `module_loader` / `DynamicForm`) follows the repo-root `MODULE_SPEC.md`.

## ke shell (task modules)

- Scan `backend/modules/<id>/module.json` + `handler.py`
- Optional mirror: `frontend/modules/<id>/module.json` (and Form/Result)
- API: `GET /api/modules`, `POST /api/tasks`, `GET /api/tasks/{id}`
- Dispatch: `get_handler(module_id).run(params)` — no if-else
- Local run: SQLite + sync execution (no Docker / Redis required)
