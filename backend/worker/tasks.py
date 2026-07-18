"""
Data-driven task dispatch: handler = get_handler(module_id).run(params).
No module_id if-else.

Execution stages (for explicit error UI):
  validate -> load -> run -> persist
"""
from __future__ import annotations

import logging
from uuid import UUID

from worker.celery_app import celery_app
from worker.module_loader import ModuleLoadError, get_module_loader

logger = logging.getLogger(__name__)

STAGE_LABELS = {
    "validate": "校验",
    "load": "加载模块",
    "run": "执行",
    "persist": "落库",
}


class StageError(Exception):
    """Carries which pipeline stage failed for structured error_message."""

    def __init__(self, stage: str, message: str, module_id: str | None = None):
        self.stage = stage
        self.module_id = module_id
        label = STAGE_LABELS.get(stage, stage)
        mid = f" 模块 {module_id}" if module_id else ""
        super().__init__(f"[{stage}|{label}]{mid}：{message}")


def execute_task(task_id: str) -> dict:
    """Run one task in-process (used by local sync mode and Celery worker)."""
    from db.models import Task
    from db.session import SessionLocal

    db = SessionLocal()
    stage = "validate"
    module_id: str | None = None
    try:
        task = db.get(Task, UUID(task_id))
        if task is None:
            logger.error("task not found: %s", task_id)
            return {"ok": False, "error": "not_found", "stage": "validate"}

        module_id = task.module_id
        task.status = "processing"
        task.error_message = None
        db.commit()

        stage = "load"
        loader = get_module_loader(force_reload=False)
        try:
            handler = loader.get_handler(task.module_id)
        except ModuleLoadError as exc:
            raise StageError("load", str(exc), module_id) from exc

        stage = "run"
        try:
            result = handler.run(dict(task.input_params or {}))
        except Exception as exc:
            raise StageError("run", str(exc), module_id) from exc

        stage = "persist"
        try:
            task.result = result
            task.status = "done"
            task.error_message = None
            db.commit()
        except Exception as exc:
            db.rollback()
            raise StageError("persist", str(exc), module_id) from exc

        return {"ok": True, "task_id": task_id, "result": result}
    except StageError as exc:
        logger.exception("task %s failed at %s", task_id, exc.stage)
        task = db.get(Task, UUID(task_id))
        if task is not None:
            task.status = "failed"
            task.error_message = str(exc)
            db.commit()
        return {"ok": False, "error": str(exc), "stage": exc.stage}
    except Exception as exc:
        logger.exception("task %s failed at %s", task_id, stage)
        task = db.get(Task, UUID(task_id))
        if task is not None:
            label = STAGE_LABELS.get(stage, stage)
            mid = f" 模块 {module_id}" if module_id else ""
            task.status = "failed"
            task.error_message = f"[{stage}|{label}]{mid}：{exc}"
            db.commit()
        return {"ok": False, "error": str(exc), "stage": stage}
    finally:
        db.close()


def enqueue_task(task_id: str) -> dict | None:
    """
    Queue or run a task.
    Local default TASK_SYNC=true: always execute_task (no Redis / worker needed).
    Returns execute_task result when run sync; otherwise None.
    """
    from api.config import get_settings

    settings = get_settings()
    if getattr(settings, "task_sync", True):
        return execute_task(task_id)

    try:
        process_task.delay(task_id)
    except Exception as exc:
        logger.warning("celery enqueue failed, running sync: %s", exc)
        return execute_task(task_id)
    return None


@celery_app.task(name="worker.process_task")
def process_task(task_id: str) -> dict:
    return execute_task(task_id)
