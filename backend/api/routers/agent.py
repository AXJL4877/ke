"""Agent discovery: playbook for Cursor browser click-acceptance (not a recipe runner)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter

from worker.module_loader import get_module_loader

router = APIRouter()

# Keep in sync with frontend/lib/agent-macros.ts
AGENT_MACROS: list[dict[str, Any]] = [
    {
        "id": "echo-hello",
        "module_id": "echo",
        "label": "试跑",
        "input_params": {"message": "hello"},
        "auto_run": False,
    },
]

TESTID_CONVENTION = {
    "nav": ["ke-nav-home", "ke-nav-tasks", "ke-nav-assets"],
    "module_card": "ke-module-card-{module_id}",
    "module_nav": "ke-module-nav-{module_id}",
    "task_open_input": "ke-task-open-input",
    "task_submit": "ke-task-submit",
    "task_result": "ke-task-result",
    "task_status": "ke-task-status",
    "field": "ke-field-{name}",
    "form": "ke-form",
    "macro": "ke-macro-{macro_id}",
}

DEEPLINK_TEMPLATES = {
    "open_input": "/tasks?module={module_id}&open=1",
    "macro": "/tasks?module={module_id}&macro={macro_id}",
}


def _catalog_path() -> Path:
    # ke/backend/api/routers/agent.py → ke/
    return Path(__file__).resolve().parents[3] / "modules.catalog.json"


def _schema_summary(input_schema: dict[str, Any] | None) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for name, spec in (input_schema or {}).items():
        if not isinstance(spec, dict):
            continue
        out.append(
            {
                "name": name,
                "type": spec.get("type"),
                "required": bool(spec.get("required")),
                "label": spec.get("label") or name,
                "testid": f"ke-field-{name}",
            }
        )
    return out


@router.get("/playbook")
def agent_playbook() -> dict[str, Any]:
    """Map for browser agents: click path first; HTTP is secondary."""
    loader = get_module_loader(force_reload=False)
    modules_out: list[dict[str, Any]] = []
    for manifest in loader.list_manifests(for_api=True):
        mid = str(manifest.get("id") or "")
        if not mid:
            continue
        ui_hint = manifest.get("ui_hint") or {}
        modules_out.append(
            {
                "id": mid,
                "name": manifest.get("name"),
                "hidden": bool(ui_hint.get("hidden")),
                "fields": _schema_summary(manifest.get("input_schema")),
                "deeplink_open": f"/tasks?module={mid}&open=1",
            }
        )
    modules_out.sort(key=lambda m: str(m.get("id")))

    catalog_recipes: list[dict[str, Any]] = []
    cat = _catalog_path()
    if cat.is_file():
        try:
            data = json.loads(cat.read_text(encoding="utf-8"))
            for r in data.get("recipes") or []:
                catalog_recipes.append(
                    {
                        "id": r.get("id"),
                        "name": r.get("name"),
                        "modules": r.get("modules"),
                        "note": "接入目录配方，不是运行时一键执行",
                    }
                )
        except (OSError, json.JSONDecodeError):
            pass

    return {
        "purpose": "Cursor 浏览器点击验收工作台；功能是否可用以 UI 跑通为准",
        "click_acceptance": {
            "steps": [
                "打开 /tasks?module={id}&open=1（或 &macro=…）",
                "snapshot 找 ke-field-* 填写 / 点 ke-macro-*",
                "点 ke-task-submit",
                "读 ke-task-status（done|failed）与 ke-task-result",
            ],
            "testid": TESTID_CONVENTION,
            "deeplink": DEEPLINK_TEMPLATES,
            "macros": AGENT_MACROS,
        },
        "modules": modules_out,
        "http_optional": {
            "create_task": "POST /api/tasks { module_id, input_params }",
            "get_task": "GET /api/tasks/{id}",
            "note": "点击路径会间接触发同一 API；验收优先点 UI",
        },
        "catalog_recipes": catalog_recipes,
        "ui_copy_rules": [
            "用户可见表单只留短 label + 必填/可选输入，不渲染 description",
            "禁止端口、代理路径、联调黑话上屏",
        ],
    }
