from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from api.config import get_settings
from api.deps import DbDep, get_optional_user
from api.schemas.task import TaskCreate, TaskOut
from db.models import Task
from db.session import SessionLocal
from worker.tasks import enqueue_task, execute_task

router = APIRouter()


@router.post("", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
def create_task(
    body: TaskCreate,
    db: DbDep,
    user=Depends(get_optional_user),
) -> Task:
    task = Task(
        module_id=body.module_id,
        input_params=body.input_params,
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
