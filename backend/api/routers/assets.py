"""Asset vault API — browse and manage reusable module outputs."""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import String, cast, or_

from api.deps import DbDep, get_optional_user
from api.schemas.asset import AssetCreate, AssetListItem, AssetOut, AssetUpdate
from core.assets import asset_to_list_item, register_assets_from_task
from db.models import Asset, Task
from worker.module_loader import get_module_loader

router = APIRouter()


def _to_out(asset: Asset) -> dict:
    base = asset_to_list_item(asset)
    base.update(
        {
            "text_content": asset.text_content,
            "storage_key": asset.storage_key,
            "bytes_size": asset.bytes_size,
            "checksum": asset.checksum,
            "meta": asset.meta or {},
            "provenance": asset.provenance or {},
        }
    )
    return base


@router.get("", response_model=list[AssetListItem])
def list_assets(
    db: DbDep,
    module_id: str | None = Query(default=None),
    kind: str | None = Query(default=None),
    q: str | None = Query(default=None, description="Search title / text"),
    tag: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[dict]:
    query = db.query(Asset).order_by(Asset.created_at.desc())
    if module_id:
        query = query.filter(Asset.module_id == module_id)
    if kind:
        query = query.filter(Asset.kind == kind)
    if q and q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(
            or_(Asset.title.ilike(like), Asset.text_content.ilike(like))
        )
    if tag and tag.strip():
        # Portable across SQLite JSON storage
        query = query.filter(cast(Asset.tags, String).like(f'%"{tag.strip()}"%'))
    rows = query.offset(offset).limit(limit).all()
    return [asset_to_list_item(a) for a in rows]


@router.get("/{asset_id}", response_model=AssetOut)
def get_asset(asset_id: UUID, db: DbDep) -> dict:
    asset = db.get(Asset, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")
    return _to_out(asset)


@router.post("", response_model=AssetOut, status_code=status.HTTP_201_CREATED)
def create_asset(
    body: AssetCreate,
    db: DbDep,
    user=Depends(get_optional_user),
) -> dict:
    asset = Asset(
        title=body.title.strip()[:200],
        kind=body.kind,
        module_id=body.module_id,
        source_service=body.source_service,
        source="upload",
        mime=body.mime,
        text_content=body.text_content,
        url=body.url,
        tags=list(body.tags or []),
        meta=dict(body.meta or {}),
        provenance=dict(body.provenance or {}),
        user_id=user.id if user else None,
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return _to_out(asset)


@router.patch("/{asset_id}", response_model=AssetOut)
def update_asset(asset_id: UUID, body: AssetUpdate, db: DbDep) -> dict:
    asset = db.get(Asset, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")
    if body.title is not None:
        asset.title = body.title.strip()[:200]
    if body.tags is not None:
        asset.tags = list(body.tags)
    if body.meta is not None:
        asset.meta = dict(body.meta)
    db.commit()
    db.refresh(asset)
    return _to_out(asset)


@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_asset(
    asset_id: UUID,
    db: DbDep,
    delete_file: bool = Query(default=False),
) -> None:
    asset = db.get(Asset, asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Asset not found")
    if delete_file and asset.storage_key:
        try:
            from storage.client import get_storage

            get_storage().delete(asset.storage_key)
        except Exception:
            pass
    db.delete(asset)
    db.commit()


@router.post("/from-task/{task_id}", response_model=list[AssetListItem])
def ingest_from_task(task_id: UUID, db: DbDep) -> list[dict]:
    """Backfill: register assets from an existing successful task."""
    task = db.get(Task, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.status != "done" or not isinstance(task.result, dict):
        raise HTTPException(status_code=400, detail="只能从成功任务回填资产")

    loader = get_module_loader(force_reload=False)
    manifest = loader.get_raw_manifest(task.module_id)
    summaries = register_assets_from_task(
        db,
        task_id=task.id,
        module_id=task.module_id,
        result=task.result,
        manifest=manifest,
        user_id=task.user_id,
    )
    if summaries:
        merged = dict(task.result)
        merged["_assets"] = summaries
        task.result = merged
        db.commit()

    ids = [UUID(s["id"]) for s in summaries]
    rows = db.query(Asset).filter(Asset.id.in_(ids)).all() if ids else []
    return [asset_to_list_item(a) for a in rows]
