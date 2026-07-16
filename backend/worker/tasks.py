"""
Data-driven task dispatch: handler = get_handler(module_id).run(params).
No module_id if-else.
"""
from __future__ import annotations

import logging
from uuid import UUID

from worker.celery_app import celery_app
from worker.module_loader import get_module_loader

logger = logging.getLogger(__name__)


def execute_task(task_id: str) -> dict:
    """Run one task in-process (used by local sync mode and Celery worker)."""
    from db.models import Task
    from db.session import SessionLocal

    db = SessionLocal()
    try:
        task = db.get(Task, UUID(task_id))
        if task is None:
            logger.error("task not found: %s", task_id)
            return {"ok": False, "error": "not_found"}

        task.status = "processing"
        db.commit()

        loader = get_module_loader(force_reload=True)
        handler = loader.get_handler(task.module_id)
        result = handler.run(dict(task.input_params or {}))

        task.result = result
        task.status = "done"
        task.error_message = None
        db.commit()
        return {"ok": True, "task_id": task_id, "result": result}
    except Exception as exc:
        logger.exception("task %s failed", task_id)
        task = db.get(Task, UUID(task_id))
        if task is not None:
            task.status = "failed"
            task.error_message = str(exc)
            db.commit()
        return {"ok": False, "error": str(exc)}
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
