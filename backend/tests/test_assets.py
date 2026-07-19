"""Tests for asset vault extraction and registration."""
from __future__ import annotations

import uuid

from core.assets import extract_asset_candidates, register_assets_from_task
from db.base import Base
from db.models import Asset, Task
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


def test_extract_with_asset_extract_rules():
    result = {
        "title": "示例视频",
        "result_text": "这是一段转写文案内容足够长",
        "result_audio": "http://127.0.0.1:8000/files/a.wav",
        "provenance": {"source": "transcript", "mock": False},
    }
    manifest = {
        "asset_extract": [
            {
                "from": "result_text",
                "kind": "text",
                "title_from": "title",
                "title_default": "转写文案",
            },
            {"from": "result_audio", "kind": "audio", "is_file": True},
        ]
    }
    cands = extract_asset_candidates(result, module_id="demo", manifest=manifest)
    assert len(cands) == 2
    assert cands[0]["kind"] == "text"
    assert cands[0]["title"] == "示例视频"
    assert cands[1]["kind"] == "audio"
    assert cands[1]["url"].endswith("a.wav")


def test_extract_heuristic_text_and_file():
    result = {
        "title": "hello",
        "transcript": "abcdefghij" * 5,
        "result_video": "http://localhost:8000/files/out.mp4",
        "_ke": {"hints": []},
    }
    cands = extract_asset_candidates(result, module_id="echo", manifest=None)
    kinds = {c["kind"] for c in cands}
    assert "text" in kinds
    assert "video" in kinds


def test_extract_skips_tiny_or_internal():
    result = {"ok": True, "_ke": {}, "x": "short"}
    assert extract_asset_candidates(result, module_id="x") == []


def test_register_assets_and_survive_task_delete():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    db = Session()

    task = Task(module_id="echo", input_params={}, status="done", result={})
    db.add(task)
    db.commit()
    db.refresh(task)

    result = {
        "title": "Echo 结果",
        "text": "这是足够长的正文内容用来入库测试用",
        "provenance": {"source": "echo", "mock": False},
    }
    summaries = register_assets_from_task(
        db,
        task_id=task.id,
        module_id="echo",
        result=result,
        manifest=None,
        user_id=None,
    )
    assert len(summaries) == 1
    asset_id = uuid.UUID(summaries[0]["id"])

    assets = db.query(Asset).all()
    assert len(assets) == 1
    assert assets[0].kind == "text"
    assert assets[0].task_id == task.id

    # Delete task — assets should remain (SET NULL)
    db.delete(task)
    db.commit()
    asset = db.get(Asset, asset_id)
    assert asset is not None
    assert asset.task_id is None

    db.close()
