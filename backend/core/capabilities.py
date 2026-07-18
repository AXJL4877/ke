"""
Force MODULE_SPEC §10 capabilities[] as integration DoD.

Business modules must declare capabilities; must_keep items are surfaced
so host wiring cannot silently drop aux features (cookies, proxies, etc.).
"""
from __future__ import annotations

from typing import Any

REQUIRED_CAP_KEYS = ("id", "desc", "kind", "must_keep", "verify")


class CapabilitiesError(ValueError):
    pass


def validate_capabilities(
    capabilities: Any,
    *,
    module_id: str,
    required: bool,
) -> list[str]:
    """
    Validate capabilities array. Returns warning strings (non-fatal shape notes).
    Raises CapabilitiesError when required and missing/invalid.
    """
    warnings: list[str] = []
    if capabilities is None:
        if required:
            raise CapabilitiesError(
                f"{module_id}: module.json 缺少 capabilities[]（接入完成定义，见 MODULE_SPEC §10）。"
                "未登记能力 = 宿主易漏接小功能。"
            )
        warnings.append("未声明 capabilities[]")
        return warnings

    if not isinstance(capabilities, list):
        raise CapabilitiesError(f"{module_id}: capabilities 必须是数组")

    if required and len(capabilities) == 0:
        raise CapabilitiesError(
            f"{module_id}: capabilities[] 为空。至少登记主能力与 must_keep 辅助能力。"
        )

    seen_ids: set[str] = set()
    must_keep_count = 0
    for i, cap in enumerate(capabilities):
        if not isinstance(cap, dict):
            raise CapabilitiesError(f"{module_id}: capabilities[{i}] 必须是对象")
        missing = [k for k in REQUIRED_CAP_KEYS if k not in cap]
        if missing:
            raise CapabilitiesError(
                f"{module_id}: capabilities[{i}] 缺少字段 {missing}"
            )
        cid = cap.get("id")
        if not isinstance(cid, str) or not cid.strip():
            raise CapabilitiesError(f"{module_id}: capabilities[{i}].id 必须是非空字符串")
        if cid in seen_ids:
            raise CapabilitiesError(f"{module_id}: capabilities id 重复: {cid}")
        seen_ids.add(cid)

        kind = cap.get("kind")
        if kind not in ("core", "aux", "invariant"):
            raise CapabilitiesError(
                f"{module_id}: capability {cid!r} kind 必须是 core|aux|invariant，收到 {kind!r}"
            )
        if not isinstance(cap.get("must_keep"), bool):
            raise CapabilitiesError(
                f"{module_id}: capability {cid!r} must_keep 必须是 boolean"
            )
        if cap["must_keep"]:
            must_keep_count += 1

        verify = cap.get("verify")
        if not isinstance(verify, dict) or not verify:
            raise CapabilitiesError(
                f"{module_id}: capability {cid!r} verify 必须是非空对象"
            )
        if "manual" not in verify and "method" not in verify:
            raise CapabilitiesError(
                f"{module_id}: capability {cid!r} verify 需含 method 或 manual"
            )

        endpoints = cap.get("endpoints")
        if endpoints is not None and not isinstance(endpoints, list):
            raise CapabilitiesError(
                f"{module_id}: capability {cid!r} endpoints 必须是数组"
            )

    if required and must_keep_count == 0:
        warnings.append(
            f"{module_id}: 没有任何 must_keep=true 的能力；建议至少把主路径与关键辅助能力标为 must_keep"
        )
    return warnings


def integration_report(manifest: dict[str, Any]) -> dict[str, Any]:
    """Machine-readable DoD checklist for UI / CI."""
    module_id = str(manifest.get("id") or "")
    caps = manifest.get("capabilities") or []
    items: list[dict[str, Any]] = []
    must_keep_total = 0
    auto_verify = 0
    manual_verify = 0

    if isinstance(caps, list):
        for cap in caps:
            if not isinstance(cap, dict):
                continue
            must_keep = bool(cap.get("must_keep"))
            if must_keep:
                must_keep_total += 1
            verify = cap.get("verify") if isinstance(cap.get("verify"), dict) else {}
            mode = "manual" if verify.get("manual") else "auto" if verify.get("method") else "unknown"
            if mode == "auto":
                auto_verify += 1
            elif mode == "manual":
                manual_verify += 1
            endpoints = cap.get("endpoints") if isinstance(cap.get("endpoints"), list) else []
            items.append(
                {
                    "id": cap.get("id"),
                    "desc": cap.get("desc"),
                    "kind": cap.get("kind"),
                    "must_keep": must_keep,
                    "endpoints": endpoints,
                    "verify_mode": mode,
                    "verify": verify,
                    "host_action": (
                        "必须在宿主接通并验收"
                        if must_keep
                        else "建议接通"
                    ),
                }
            )

    ok = isinstance(caps, list) and len(caps) > 0
    return {
        "module_id": module_id,
        "ok": ok,
        "capabilities_declared": len(items),
        "must_keep_count": must_keep_total,
        "auto_verify_count": auto_verify,
        "manual_verify_count": manual_verify,
        "items": items,
        "message": (
            "capabilities 已登记；接入时须逐条验收 must_keep"
            if ok
            else "缺少 capabilities[]，接入未完成"
        ),
    }
