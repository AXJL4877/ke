# -*- coding: utf-8 -*-
"""Context for the currently executing ke task — handlers can report progress."""
from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar
from typing import Iterator

_current_task_id: ContextVar[str | None] = ContextVar("ke_task_id", default=None)

# Downstream job progress maps into the shell "run" band when no business stage set.
_RUN_LO = 28.0
_RUN_HI = 90.0


@contextmanager
def task_progress_scope(task_id: str) -> Iterator[None]:
    token = _current_task_id.set(task_id)
    try:
        yield
    finally:
        _current_task_id.reset(token)


def current_task_id() -> str | None:
    return _current_task_id.get()


def report_progress(
    *,
    progress: float | None = None,
    message: str | None = None,
    stage: str | None = "run",
    job_progress: float | None = None,
) -> None:
    """
    Report progress for the task in scope.

    Prefer report_stage() for business steps (write_copy / voiceover / mix_bgm …).
    """
    tid = current_task_id()
    if not tid:
        return
    pct = progress
    if pct is None and job_progress is not None:
        jp = max(0.0, min(100.0, float(job_progress)))
        pct = _RUN_LO + (_RUN_HI - _RUN_LO) * (jp / 100.0)
    from worker.tasks import update_task_progress

    update_task_progress(tid, progress=pct, message=message, stage=stage)


def report_stage(
    stage_id: str,
    *,
    progress: float | None = None,
    message: str | None = None,
    job_progress: float | None = None,
) -> None:
    """
    上报标准业务环节（见 core/progress_stages.STAGES / TASK_PROGRESS.md）。

    例：
      report_stage("write_copy")
      report_stage("voiceover", progress=62, message="配音 3/8 句")
      report_stage("mix_bgm")
    """
    from core.progress_stages import stage_anchor, stage_label

    label = stage_label(stage_id)
    msg = (message or "").strip() or label
    pct = progress
    if pct is None and job_progress is not None:
        anchor = stage_anchor(stage_id) or _RUN_LO
        # 在锚点附近按下游 job 进度微调（锚点 ~ 锚点+12）
        jp = max(0.0, min(100.0, float(job_progress)))
        pct = float(anchor) + 12.0 * (jp / 100.0)
    if pct is None:
        pct = stage_anchor(stage_id)
    report_progress(progress=pct, message=msg, stage=stage_id)
