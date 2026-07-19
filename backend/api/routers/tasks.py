from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from api.config import get_settings
from api.deps import DbDep, get_optional_user
from api.schemas.task import TaskCreate, TaskOut
from core.anti_mock import find_mock_params
from db.models import Task
from db.session import SessionLocal
from worker.module_loader import get_module_loader
from worker.tasks import enqueue_task, execute_task

router = APIRouter()


@router.post("", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
def create_task(
    body: TaskCreate,
    db: DbDep,
    user=Depends(get_optional_user),
) -> Task:
    loader = get_module_loader(force_reload=False)
    if loader.get_raw_manifest(body.module_id) is None:
        raise HTTPException(
            status_code=400,
            detail=f"未知模块 {body.module_id!r}。请确认已放入 backend/modules/ 并 reload。",
        )

    params = dict(body.input_params or {})
    mock_hits = find_mock_params(params)
    if mock_hits:
        # Soft only: allow submit; UI/result layer may still hint
        import logging

        logging.getLogger(__name__).warning(
            "task %s submitted with mock-like params %s (soft hint only)",
            body.module_id,
            mock_hits,
        )

    task = Task(
        module_id=body.module_id,
        input_params=params,
        status="pending",
        user_id=user.id if user else None,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    task_id = task.id

    # Release this request's SQLite lock before the worker session writes
    db.expunge(task)
    db.commit()

    if get_settings().task_sync:
        execute_task(str(task_id))
    else:
        enqueue_task(str(task_id))

    s2 = SessionLocal()
    try:
        updated = s2.get(Task, task_id)
        if updated is None:
            raise HTTPException(status_code=500, detail="task missing after enqueue")
        s2.expunge(updated)
        return updated
    finally:
        s2.close()


@router.get("", response_model=list[TaskOut])
def list_tasks(
    db: DbDep,
    module_id: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
) -> list[Task]:
    q = db.query(Task).order_by(Task.created_at.desc())
    if module_id:
        q = q.filter(Task.module_id == module_id)
    return q.limit(limit).all()


@router.get("/{task_id}", response_model=TaskOut)
def get_task(task_id: UUID, db: DbDep) -> Task:
    task = db.get(Task, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.get("/{task_id}/result")
def get_task_result(task_id: UUID, db: DbDep) -> dict:
    task = db.get(Task, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return {
        "id": str(task.id),
        "status": task.status,
        "result": task.result,
        "error_message": task.error_message,
    }


@router.delete("", status_code=status.HTTP_200_OK)
def clear_finished_tasks(
    db: DbDep,
    module_id: str | None = Query(default=None),
) -> dict:
    """批量清空已结束（done/failed）的任务，可按模块过滤。资产保留。"""
    from db.models import Asset

    q = db.query(Task).filter(Task.status.in_(["done", "failed"]))
    if module_id:
        q = q.filter(Task.module_id == module_id)
    task_ids = [row.id for row in q.with_entities(Task.id).all()]
    if task_ids:
        db.query(Asset).filter(Asset.task_id.in_(task_ids)).update(
            {Asset.task_id: None}, synchronize_session=False
        )
    deleted = q.delete(synchronize_session=False)
    db.commit()
    return {"deleted": deleted}


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(task_id: UUID, db: DbDep) -> None:
    task = db.get(Task, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    # Keep assets: clear FK before deleting the task row
    from db.models import Asset

    db.query(Asset).filter(Asset.task_id == task_id).update(
        {Asset.task_id: None}, synchronize_session=False
    )
    db.delete(task)
    db.commit()
