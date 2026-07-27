# -*- coding: utf-8 -*-
"""SQLite 轻量补列：create_all 不会给已有表加列。"""
from __future__ import annotations

import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

# (table, column, DDL type fragment)
_TASK_PROGRESS_COLS = (
    ("progress", "FLOAT"),
    ("progress_message", "TEXT"),
    ("progress_stage", "VARCHAR(64)"),
)


def ensure_schema(engine: Engine) -> None:
    """Idempotent: add Task progress columns if missing (SQLite / Postgres)."""
    try:
        insp = inspect(engine)
        if "tasks" not in insp.get_table_names():
            return
        existing = {c["name"] for c in insp.get_columns("tasks")}
    except Exception:
        logger.exception("schema inspect failed")
        return

    missing = [(name, typ) for name, typ in _TASK_PROGRESS_COLS if name not in existing]
    if not missing:
        return

    dialect = engine.dialect.name
    with engine.begin() as conn:
        for name, typ in missing:
            # SQLite / Postgres both accept ADD COLUMN
            conn.execute(text(f"ALTER TABLE tasks ADD COLUMN {name} {typ}"))
            logger.info("added column tasks.%s (%s)", name, dialect)
