"""System lifecycle: shutdown ke and all managed backends."""
from __future__ import annotations

import logging
import subprocess
import sys

from fastapi import APIRouter, HTTPException

from core.integration_contract import ke_root
from core.progress_stages import catalog_payload

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/progress-stages")
def progress_stages() -> dict:
    """标准业务进度词表 + 配方预设（智能体 / 前端对齐用）。"""
    return catalog_payload()


@router.post("/shutdown")
def shutdown_ke() -> dict[str, str]:
    """
    Detached stop.ps1 — kills ke backend/frontend and contract local modules.
    Called when user exits KE from the browser.
    """
    if sys.platform != "win32":
        raise HTTPException(status_code=501, detail="Shutdown script is Windows-only")

    script = ke_root() / "stop.ps1"
    if not script.is_file():
        raise HTTPException(status_code=500, detail="stop.ps1 not found")

    try:
        flags = subprocess.CREATE_NO_WINDOW | subprocess.DETACHED_PROCESS
    except AttributeError:
        flags = 0

    try:
        subprocess.Popen(
            [
                "powershell",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(script),
            ],
            creationflags=flags,
            close_fds=True,
            cwd=str(ke_root()),
        )
    except Exception as exc:
        logger.exception("failed to spawn stop.ps1")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {"ok": "true", "message": "正在关闭 KE 及全部后端"}
