"""
On-demand local HTTP module launcher.

ke start.ps1 默认静默拉起全部契约下游；执行任务前仍可按模块契约
只补启需要的 service_id（仍走 Start-LocalServices.ps1 + KE_SILENT）。
"""
from __future__ import annotations

import logging
import os
import subprocess
import sys
from typing import Any

from core.integration_contract import ke_root
from core.local_service_bridge import discover_from_contract_source, LocalServiceError

logger = logging.getLogger(__name__)


def _on_demand_enabled() -> bool:
    return os.environ.get("KE_ON_DEMAND_LOCAL", "1").lower() not in ("0", "false", "no")


def collect_service_ids_from_contract(contract: dict[str, Any]) -> list[str]:
    """Unique service_id list from contract source + depends_on."""
    ids: list[str] = []
    seen: set[str] = set()

    def add(entry: Any) -> None:
        if not isinstance(entry, dict):
            return
        sid = entry.get("service_id")
        if not isinstance(sid, str) or not sid.strip():
            return
        key = sid.strip()
        if key in seen:
            return
        seen.add(key)
        ids.append(key)

    add(contract.get("source"))
    for dep in contract.get("depends_on") or []:
        add(dep)
    return ids


def _dep_entries_for_service(
    contract: dict[str, Any], service_id: str
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    source = contract.get("source")
    if isinstance(source, dict) and str(source.get("service_id")) == service_id:
        out.append(source)
    for dep in contract.get("depends_on") or []:
        if isinstance(dep, dict) and str(dep.get("service_id")) == service_id:
            out.append(dep)
    return out


def services_already_live(contract: dict[str, Any], service_ids: list[str]) -> bool:
    """True when every requested service responds to health probe."""
    for sid in service_ids:
        entries = _dep_entries_for_service(contract, sid)
        if not entries:
            return False
        dep = entries[0]
        try:
            discover_from_contract_source(dep, deep=False)
        except LocalServiceError:
            return False
    return True


def ensure_local_services(
    service_ids: list[str],
    *,
    wait_seconds: int = 90,
) -> None:
    """
    Start missing local backends via Start-LocalServices.ps1 (Windows).
    No-op when KE_ON_DEMAND_LOCAL=0 or service_ids empty.
    """
    if not service_ids or not _on_demand_enabled():
        return
    if sys.platform != "win32":
        logger.debug("on-demand local start skipped (non-Windows)")
        return

    script = ke_root() / "scripts" / "Start-LocalServices.ps1"
    if not script.is_file():
        logger.warning("Start-LocalServices.ps1 missing; cannot start %s", service_ids)
        return

    args = [
        "powershell",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        str(script),
        "-KeRoot",
        str(ke_root()),
        "-WaitSeconds",
        str(wait_seconds),
    ]
    for sid in service_ids:
        args.extend(["-ServiceIds", sid])

    logger.info("on-demand local start: %s", ", ".join(service_ids))
    try:
        # Hide the powershell console that would otherwise flash when the
        # worker spawns Start-LocalServices.ps1 (modules themselves use CreateNoWindow).
        try:
            creationflags = subprocess.CREATE_NO_WINDOW
        except AttributeError:
            creationflags = 0
        proc = subprocess.run(
            args,
            capture_output=True,
            text=True,
            timeout=max(wait_seconds + 60, 120),
            check=False,
            creationflags=creationflags,
        )
        if proc.stdout:
            for line in proc.stdout.splitlines():
                if line.strip():
                    logger.info("[ke-local] %s", line)
        if proc.returncode != 0 and proc.stderr:
            logger.warning("[ke-local] exit %s: %s", proc.returncode, proc.stderr[:500])
    except subprocess.TimeoutExpired:
        logger.warning("on-demand local start timed out for %s", service_ids)
    except Exception:
        logger.exception("on-demand local start failed for %s", service_ids)


def ensure_local_services_for_contract(
    contract: dict[str, Any] | None,
    *,
    wait_seconds: int = 90,
) -> None:
    """Ensure all contract backends are up before handler.run()."""
    if not isinstance(contract, dict):
        return
    service_ids = collect_service_ids_from_contract(contract)
    if not service_ids:
        return
    if services_already_live(contract, service_ids):
        logger.debug("local services already live: %s", ", ".join(service_ids))
        return
    ensure_local_services(service_ids, wait_seconds=wait_seconds)
