"""
Integration contract: map every must_keep capability from a source HTTP
module into ke host wiring. Used at load time and by verify scripts.
"""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

WIRING_MODES = frozenset({"handler", "proxy", "ui", "preserved_internal"})
EXECUTION_MODES = frozenset({"sync", "async_job", "binary", "multipart"})

CONTRACT_FILENAME = "integration.contract.json"


class IntegrationContractError(ValueError):
    """Raised when a contract is missing, invalid, or incomplete."""


def ke_root() -> Path:
    """ke/ repository root (parent of backend/)."""
    return Path(__file__).resolve().parents[2]


def contract_path_for(module_dir: Path) -> Path:
    return module_dir / CONTRACT_FILENAME


def load_json(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise IntegrationContractError(f"文件不存在: {path}") from exc
    except json.JSONDecodeError as exc:
        raise IntegrationContractError(f"JSON 无效: {path}: {exc}") from exc
    if not isinstance(data, dict):
        raise IntegrationContractError(f"根节点必须是对象: {path}")
    return data


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_text(path.read_text(encoding="utf-8"))


def resolve_manifest_path(manifest_path: str, *, module_dir: Path | None = None) -> Path:
    """Resolve source module.json relative to ke root, then module dir, then cwd."""
    p = Path(manifest_path)
    if p.is_absolute():
        return p
    candidates = [
        ke_root() / p,
        (module_dir / p) if module_dir else None,
        Path.cwd() / p,
        ke_root().parent / p,  # e.g. mo_kuai/video_download/module.json from sibling
    ]
    for c in candidates:
        if c is not None and c.is_file():
            return c.resolve()
    raise IntegrationContractError(
        f"找不到源 module.json: {manifest_path}（已试 ke 根、模块目录、cwd、ke 上级）"
    )


def _require_str(obj: dict[str, Any], key: str, ctx: str) -> str:
    val = obj.get(key)
    if not isinstance(val, str) or not val.strip():
        raise IntegrationContractError(f"{ctx}: 缺少非空字符串字段 {key!r}")
    return val.strip()


def _endpoint_path(ep: str) -> str:
    """Normalize 'GET /cookies/sites' or '/cookies/sites' → '/cookies/sites'."""
    s = (ep or "").strip()
    if not s:
        return ""
    m = re.match(r"^(GET|POST|PUT|PATCH|DELETE|HEAD)\s+(\S+)$", s, re.I)
    if m:
        return m.group(2)
    if s.startswith("/"):
        return s.split()[0]
    return "/" + s.split()[0]


def validate_contract_shape(contract: dict[str, Any], *, module_id: str | None = None) -> None:
    """Structural validation without needing the source manifest on disk."""
    mid = _require_str(contract, "module_id", "contract")
    if module_id and mid != module_id:
        raise IntegrationContractError(
            f"contract.module_id={mid!r} 与模块 id={module_id!r} 不一致"
        )

    source = contract.get("source")
    if not isinstance(source, dict):
        raise IntegrationContractError("contract.source 必须是对象")
    _require_str(source, "service_id", "source")
    _require_str(source, "label", "source")
    _require_str(source, "manifest_path", "source")

    wiring = contract.get("capability_wiring")
    if not isinstance(wiring, list) or not wiring:
        raise IntegrationContractError("capability_wiring 必须是非空数组")
    seen: set[str] = set()
    for i, item in enumerate(wiring):
        if not isinstance(item, dict):
            raise IntegrationContractError(f"capability_wiring[{i}] 必须是对象")
        cid = _require_str(item, "capability_id", f"capability_wiring[{i}]")
        if cid in seen:
            raise IntegrationContractError(f"capability_wiring 重复 capability_id: {cid}")
        seen.add(cid)
        mode = item.get("wiring")
        if mode not in WIRING_MODES:
            raise IntegrationContractError(
                f"capability {cid}: wiring 必须是 {sorted(WIRING_MODES)}，收到 {mode!r}"
            )

    execution = contract.get("execution")
    if not isinstance(execution, dict):
        raise IntegrationContractError("execution 必须是对象")
    mode = execution.get("mode")
    if mode not in EXECUTION_MODES:
        raise IntegrationContractError(
            f"execution.mode 必须是 {sorted(EXECUTION_MODES)}，收到 {mode!r}"
        )

    evidence = contract.get("success_evidence")
    if not isinstance(evidence, dict):
        raise IntegrationContractError("success_evidence 必须是对象")
    if "require_provenance" not in evidence or not isinstance(
        evidence.get("require_provenance"), bool
    ):
        raise IntegrationContractError("success_evidence.require_provenance 必须是 boolean")

    if mode == "async_job":
        keys = evidence.get("required_result_keys") or []
        if not isinstance(keys, list) or not any(
            k in ("job_id", "archive_id") for k in keys if isinstance(k, str)
        ):
            raise IntegrationContractError(
                "execution.mode=async_job 时 success_evidence.required_result_keys "
                "必须包含 job_id 或 archive_id"
            )

    depends = contract.get("depends_on")
    if depends is not None:
        if not isinstance(depends, list):
            raise IntegrationContractError("depends_on 必须是数组")
        for i, dep in enumerate(depends):
            if not isinstance(dep, dict):
                raise IntegrationContractError(f"depends_on[{i}] 必须是对象")
            _require_str(dep, "service_id", f"depends_on[{i}]")
            _require_str(dep, "label", f"depends_on[{i}]")

    manual = contract.get("manual_acceptance")
    if manual is not None:
        if not isinstance(manual, list):
            raise IntegrationContractError("manual_acceptance 必须是数组")
        for i, row in enumerate(manual):
            if not isinstance(row, dict):
                raise IntegrationContractError(f"manual_acceptance[{i}] 必须是对象")
            _require_str(row, "capability_id", f"manual_acceptance[{i}]")
            if not isinstance(row.get("accepted"), bool):
                raise IntegrationContractError(
                    f"manual_acceptance[{i}].accepted 必须是 boolean"
                )
            note = row.get("note")
            if not isinstance(note, str) or not note.strip():
                raise IntegrationContractError(
                    f"manual_acceptance[{i}].note 必须是非空字符串"
                )


def must_keep_capabilities(source_manifest: dict[str, Any]) -> list[dict[str, Any]]:
    caps = source_manifest.get("capabilities") or []
    if not isinstance(caps, list):
        raise IntegrationContractError("源 module.json capabilities 必须是数组")
    out: list[dict[str, Any]] = []
    for cap in caps:
        if isinstance(cap, dict) and cap.get("must_keep") is True:
            out.append(cap)
    return out


def validate_capability_coverage(
    contract: dict[str, Any],
    source_manifest: dict[str, Any],
) -> dict[str, Any]:
    """
    Ensure every must_keep capability is wired exactly once.
    Returns a coverage report; raises if incomplete.
    """
    must_keep = must_keep_capabilities(source_manifest)
    must_ids = {str(c["id"]) for c in must_keep if c.get("id")}
    wired = {
        str(item["capability_id"]): item
        for item in contract.get("capability_wiring") or []
        if isinstance(item, dict) and item.get("capability_id")
    }

    missing = sorted(must_ids - set(wired))
    extra = sorted(set(wired) - must_ids)
    errors: list[str] = []
    if missing:
        errors.append(
            "漏接 must_keep 能力（禁止删减）: " + ", ".join(missing)
        )
    # Extra wiring for non-must_keep is allowed (optional caps), but warn.
    warnings: list[str] = []
    if extra:
        # Only warn if they are not in source capabilities at all
        all_ids = {
            str(c.get("id"))
            for c in (source_manifest.get("capabilities") or [])
            if isinstance(c, dict)
        }
        unknown = sorted(set(extra) - all_ids)
        optional_extra = sorted(set(extra) & all_ids - must_ids)
        if unknown:
            errors.append("capability_wiring 引用了源模块不存在的能力: " + ", ".join(unknown))
        if optional_extra:
            warnings.append(
                "capability_wiring 含非 must_keep 能力（允许）: " + ", ".join(optional_extra)
            )

    # Endpoint coverage: for each must_keep with endpoints, proxy/handler must list paths
    endpoint_gaps: list[str] = []
    for cap in must_keep:
        cid = str(cap.get("id"))
        item = wired.get(cid)
        if not item:
            continue
        endpoints = cap.get("endpoints") if isinstance(cap.get("endpoints"), list) else []
        paths = [_endpoint_path(e) for e in endpoints if isinstance(e, str)]
        paths = [p for p in paths if p]
        if not paths:
            continue
        mode = item.get("wiring")
        if mode == "preserved_internal":
            continue
        declared = item.get("proxy_paths")
        if not isinstance(declared, list) or not declared:
            # Auto-ok if wiring is handler and endpoints only hit primary path — still require list
            endpoint_gaps.append(
                f"{cid}: 有 endpoints {paths}，capability_wiring.proxy_paths 必须列出"
            )
            continue
        declared_norm = {_endpoint_path(p) if not str(p).startswith("/") else str(p).split()[0]
                         for p in declared}
        # Also accept bare paths
        declared_norm = {p if p.startswith("/") else "/" + p for p in declared_norm}
        for path in paths:
            # :id style — match prefix
            base = path.split(":")[0].rstrip("/") or path
            if path not in declared_norm and not any(
                d == path or d.startswith(base) or path.startswith(d.rstrip("/"))
                for d in declared_norm
            ):
                endpoint_gaps.append(f"{cid}: 未覆盖 endpoint 路径 {path}")

    if endpoint_gaps:
        errors.extend(endpoint_gaps)

    # Manual acceptance for must_keep with only verify.manual
    manual_rows = {
        str(r.get("capability_id")): r
        for r in (contract.get("manual_acceptance") or [])
        if isinstance(r, dict)
    }
    manual_pending: list[str] = []
    for cap in must_keep:
        cid = str(cap.get("id"))
        verify = cap.get("verify") if isinstance(cap.get("verify"), dict) else {}
        if verify.get("manual") and not verify.get("method"):
            row = manual_rows.get(cid)
            if not row or row.get("accepted") is not True:
                manual_pending.append(cid)

    report = {
        "must_keep_ids": sorted(must_ids),
        "wired_ids": sorted(wired),
        "missing_must_keep": missing,
        "warnings": warnings,
        "manual_pending": manual_pending,
        "ok": not errors and not manual_pending,
        "errors": errors,
    }
    if errors:
        raise IntegrationContractError("; ".join(errors))
    return report


def validate_source_fingerprint(
    contract: dict[str, Any],
    *,
    module_dir: Path | None = None,
    source_manifest: dict[str, Any] | None = None,
    source_path: Path | None = None,
) -> Path:
    """Resolve source manifest, optional sha256 check, return path."""
    source = contract["source"]
    path = source_path or resolve_manifest_path(
        source["manifest_path"], module_dir=module_dir
    )
    expected = source.get("manifest_sha256")
    if isinstance(expected, str) and expected.strip():
        actual = sha256_file(path)
        if actual.lower() != expected.strip().lower():
            raise IntegrationContractError(
                f"源 module.json 指纹不匹配: expected {expected[:12]}… "
                f"got {actual[:12]}…（更新契约或重新对齐源模块）"
            )
    if source_manifest is None:
        source_manifest = load_json(path)
    local = source_manifest.get("local") if isinstance(source_manifest.get("local"), dict) else {}
    label = local.get("label") or source_manifest.get("id")
    if label and label != source.get("label"):
        raise IntegrationContractError(
            f"source.label={source.get('label')!r} 与源 local.label/id={label!r} 不一致"
        )
    ver = source.get("version")
    if isinstance(ver, str) and ver and source_manifest.get("version") not in (None, ver):
        # soft: only error if both present and differ
        raise IntegrationContractError(
            f"source.version={ver!r} 与源 version={source_manifest.get('version')!r} 不一致"
        )
    return path


def load_and_validate_contract(
    module_dir: Path,
    *,
    module_id: str,
    require_source_file: bool = True,
    require_manual_acceptance: bool = False,
) -> tuple[dict[str, Any], dict[str, Any] | None, dict[str, Any]]:
    """
    Load integration.contract.json next to handler.
    Returns (contract, source_manifest_or_none, coverage_report).

    require_manual_acceptance: if True, unfinished manual_acceptance → error
    (used by verify scripts). Loader uses False and surfaces manual_pending as warning.
    """
    path = contract_path_for(module_dir)
    if not path.is_file():
        raise IntegrationContractError(
            f"{module_id}: 声明接入下游时必须提供 {CONTRACT_FILENAME}"
        )
    contract = load_json(path)
    validate_contract_shape(contract, module_id=module_id)

    source_manifest: dict[str, Any] | None = None
    coverage: dict[str, Any] = {"ok": False, "skipped_source": True}
    if require_source_file:
        src_path = validate_source_fingerprint(contract, module_dir=module_dir)
        source_manifest = load_json(src_path)
        coverage = validate_capability_coverage(contract, source_manifest)
        if coverage.get("manual_pending"):
            coverage["ok"] = False
            if require_manual_acceptance:
                raise IntegrationContractError(
                    f"{module_id}: must_keep 的 manual 能力尚未验收记录: "
                    + ", ".join(coverage["manual_pending"])
                    + f"（写入 {CONTRACT_FILENAME} manual_acceptance[].accepted=true）"
                )
    return contract, source_manifest, coverage


def validate_task_result_against_contract(
    result: dict[str, Any] | None,
    contract: dict[str, Any],
    *,
    duration_ms: int | None = None,
) -> None:
    """Raise IntegrationContractError if result lacks required success evidence."""
    if not isinstance(result, dict):
        raise IntegrationContractError("结果必须是对象")

    evidence = contract.get("success_evidence") or {}
    forbid_mock = evidence.get("forbid_mock", True)
    if forbid_mock:
        from core.anti_mock import detect_mock_result

        detection = detect_mock_result(result)
        if detection["is_mock"]:
            raise IntegrationContractError(
                "结果含演示/mock 信号，拒绝记为成功: " + ", ".join(detection["signals"])
            )
        prov = result.get("provenance")
        if isinstance(prov, dict) and prov.get("mock") is True:
            raise IntegrationContractError("provenance.mock=true，拒绝记为成功")

    if evidence.get("require_provenance"):
        prov = result.get("provenance")
        if not isinstance(prov, dict):
            raise IntegrationContractError("success_evidence 要求结果含 provenance 对象")
        for field in evidence.get("provenance_fields") or ["source", "service", "mock"]:
            if field not in prov:
                raise IntegrationContractError(f"provenance 缺少字段 {field!r}")
        if prov.get("mock") is True and forbid_mock:
            raise IntegrationContractError("provenance.mock 不得为 true")

    for key in evidence.get("required_result_keys") or []:
        if not isinstance(key, str):
            continue
        # allow nested via provenance
        if key in result:
            continue
        prov = result.get("provenance") if isinstance(result.get("provenance"), dict) else {}
        if key in prov:
            continue
        raise IntegrationContractError(f"成功证据缺少字段 {key!r}")

    execution = contract.get("execution") or {}
    min_ms = execution.get("min_duration_ms")
    fast_ok = bool(execution.get("fast_completion_ok"))
    if (
        isinstance(min_ms, int)
        and min_ms > 0
        and duration_ms is not None
        and duration_ms < min_ms
        and not fast_ok
    ):
        raise IntegrationContractError(
            f"完成过快（{duration_ms}ms < min_duration_ms={min_ms}），"
            "且未声明 fast_completion_ok；疑似未调用真实下游"
        )


def build_contract_skeleton_from_source(
    source_manifest: dict[str, Any],
    *,
    module_id: str,
    manifest_path: str,
    wiring_default: str = "handler",
) -> dict[str, Any]:
    """Helper for AI/scripts: generate a draft contract covering all must_keep."""
    local = source_manifest.get("local") if isinstance(source_manifest.get("local"), dict) else {}
    caps = must_keep_capabilities(source_manifest)
    async_runtime = bool((source_manifest.get("runtime") or {}).get("async"))
    mode = "async_job" if async_runtime else "sync"
    wiring_list: list[dict[str, Any]] = []
    for cap in caps:
        endpoints = cap.get("endpoints") if isinstance(cap.get("endpoints"), list) else []
        paths = [_endpoint_path(e) for e in endpoints if isinstance(e, str)]
        paths = [p for p in paths if p]
        verify = cap.get("verify") if isinstance(cap.get("verify"), dict) else {}
        item: dict[str, Any] = {
            "capability_id": cap["id"],
            "wiring": "preserved_internal" if not paths and verify.get("manual") else wiring_default,
            "notes": cap.get("desc") or "",
        }
        if paths:
            item["proxy_paths"] = paths
            # Aux HTTP surfaces often need proxy even if handler also calls core
            if any("/cookies" in p or "/upload" in p or "/voices" in p for p in paths):
                item["wiring"] = "proxy"
        wiring_list.append(item)

    required_keys: list[str] = []
    if mode == "async_job":
        required_keys = ["job_id"]

    return {
        "schema_version": "1.0.0",
        "module_id": module_id,
        "source": {
            "service_id": source_manifest.get("id") or local.get("label") or module_id,
            "label": local.get("label") or source_manifest.get("id"),
            "manifest_path": manifest_path,
            "version": source_manifest.get("version"),
            "default_port": local.get("defaultPort"),
            "max_tries": local.get("maxTries") or 12,
            "proxy_prefixes": [
                p.get("prefix")
                for p in (local.get("proxy") or [])
                if isinstance(p, dict) and p.get("prefix")
            ],
        },
        "capability_wiring": wiring_list,
        "params_map": {},
        "execution": {
            "mode": mode,
            "timeout_seconds": int((source_manifest.get("runtime") or {}).get("timeout_seconds") or 1800),
            "poll_interval_ms": 2000,
            "job_path_template": "/jobs/{job_id}",
            "min_duration_ms": 0 if not async_runtime else 5000,
            "fast_completion_ok": not async_runtime,
        },
        "success_evidence": {
            "require_provenance": True,
            "required_result_keys": required_keys,
            "provenance_fields": ["source", "service", "mock"],
            "forbid_mock": True,
        },
        "manual_acceptance": [],
        "depends_on": [],
    }
