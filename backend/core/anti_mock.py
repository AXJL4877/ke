"""
Shell anti-mock policy (ke as product base, not demo sandbox).

Default: strip mock/demo fields from forms, reject mock params on submit,
flag mock-like results and suspiciously fast completions.
Override only with KE_ALLOW_MOCK=1.
"""
from __future__ import annotations

import re
from typing import Any

# Field keys / labels that mean "fake success path"
_MOCK_TOKEN = re.compile(
    r"(?i)(mock|demo|dry[_-]?run|fake|演示|测试模式|假数据|内置文案)"
)

_MOCK_VALUE_HINTS = (
    "【演示",
    "[MOCK]",
    "[mock]",
    "演示·",
    "演示转写",
    "【演示转写】",
)


def is_mock_field_name(key: str) -> bool:
    return bool(_MOCK_TOKEN.search(key or ""))


def is_mock_field_spec(key: str, spec: dict[str, Any] | None) -> bool:
    if is_mock_field_name(key):
        return True
    if not isinstance(spec, dict):
        return False
    for part in (spec.get("label"), spec.get("description")):
        if isinstance(part, str) and _MOCK_TOKEN.search(part):
            return True
    return False


def find_mock_schema_fields(schema: dict[str, Any] | None) -> list[str]:
    if not isinstance(schema, dict):
        return []
    return [k for k, v in schema.items() if is_mock_field_spec(k, v if isinstance(v, dict) else None)]


def strip_mock_from_schema(schema: dict[str, Any] | None) -> tuple[dict[str, Any], list[str]]:
    """Return (cleaned_schema, stripped_keys)."""
    if not isinstance(schema, dict):
        return {}, []
    stripped: list[str] = []
    out: dict[str, Any] = {}
    for key, spec in schema.items():
        if is_mock_field_spec(key, spec if isinstance(spec, dict) else None):
            stripped.append(key)
            continue
        out[key] = spec
    return out, stripped


def find_mock_params(params: dict[str, Any] | None) -> list[str]:
    """Params that enable mock (truthy mock-named keys, or demo flags)."""
    if not isinstance(params, dict):
        return []
    hits: list[str] = []
    for key, val in params.items():
        if not is_mock_field_name(key):
            continue
        if val is True or val == 1 or (isinstance(val, str) and val.strip().lower() in {"1", "true", "yes", "on"}):
            hits.append(key)
        elif val not in (None, False, 0, "", []):
            # Non-empty mock-related payload still counts
            if is_mock_field_name(key):
                hits.append(key)
    return hits


def strip_mock_params(params: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(params, dict):
        return {}
    return {k: v for k, v in params.items() if not is_mock_field_name(k)}


def _walk_strings(obj: Any, out: list[str]) -> None:
    if isinstance(obj, str):
        out.append(obj)
    elif isinstance(obj, dict):
        for v in obj.values():
            _walk_strings(v, out)
    elif isinstance(obj, list):
        for v in obj:
            _walk_strings(v, out)


def detect_mock_result(result: dict[str, Any] | None) -> dict[str, Any]:
    """Heuristic: explicit flags or mock-looking copy in result strings."""
    signals: list[str] = []
    if not isinstance(result, dict):
        return {"is_mock": False, "signals": signals}

    for key in ("is_mock", "mock", "demo", "isMock"):
        if result.get(key) is True:
            signals.append(f"result.{key}=true")

    prov = result.get("provenance")
    if isinstance(prov, dict) and prov.get("mock") is True:
        signals.append("result.provenance.mock=true")

    ke = result.get("_ke")
    if isinstance(ke, dict) and ke.get("mock") is True:
        signals.append("result._ke.mock=true")

    strings: list[str] = []
    _walk_strings(result, strings)
    for s in strings:
        for hint in _MOCK_VALUE_HINTS:
            if hint in s:
                signals.append(f"text:{hint}")
                break
        if _MOCK_TOKEN.search(s) and ("演示" in s or "MOCK" in s.upper() or "mock" in s.lower()):
            if f"text:{s[:24]}" not in signals:
                signals.append(f"copy_hint:{s[:40]}")

    # de-dupe preserving order
    seen: set[str] = set()
    uniq: list[str] = []
    for s in signals:
        if s not in seen:
            seen.add(s)
            uniq.append(s)

    return {"is_mock": len(uniq) > 0, "signals": uniq}


def annotate_shell_result(
    result: dict[str, Any] | None,
    *,
    duration_ms: int | None = None,
    fast_threshold_ms: int = 3000,
    module_id: str | None = None,
) -> dict[str, Any]:
    """Attach `_ke` shell metadata without dropping business keys."""
    base = dict(result) if isinstance(result, dict) else {}
    detection = detect_mock_result(base)
    fast = duration_ms is not None and duration_ms < fast_threshold_ms and module_id != "echo"
    hints: list[str] = []
    if detection["is_mock"]:
        hints.append("结果含演示/mock 信号，不是真实下游产出")
    if fast:
        hints.append(
            f"完成过快（{duration_ms}ms < {fast_threshold_ms}ms），请确认是否未调用真实下游"
        )

    prev = base.get("_ke") if isinstance(base.get("_ke"), dict) else {}
    base["_ke"] = {
        **prev,
        "mock": bool(detection["is_mock"] or prev.get("mock")),
        "mock_signals": detection["signals"] or prev.get("mock_signals") or [],
        "fast_completion": fast,
        "duration_ms": duration_ms,
        "hints": hints,
    }
    return base
