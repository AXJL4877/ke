#!/usr/bin/env python3
"""
Static + optional live checks for ke module integration contracts.

Usage (from ke/backend, PYTHONPATH=.):
  python -m scripts.check_contracts
  python -m scripts.check_contracts --strict-manual
  python -m scripts.check_contracts --base http://127.0.0.1:8789 --module cj-download

Exit 1 on any must_keep auto failure or missing capability wiring.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from core.integration_contract import (  # noqa: E402
    CONTRACT_FILENAME,
    IntegrationContractError,
    contract_path_for,
    load_and_validate_contract,
    load_json,
    resolve_manifest_path,
)


def _http_json(method: str, url: str, body: dict[str, Any] | None = None, timeout: float = 10.0):
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = Request(url, data=data, headers=headers, method=method.upper())
    try:
        with urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            status = getattr(resp, "status", 200)
            try:
                parsed = json.loads(raw.decode("utf-8") or "null")
            except Exception:
                parsed = None
            return status, parsed
    except HTTPError as exc:
        raw = exc.read() if hasattr(exc, "read") else b""
        try:
            parsed = json.loads(raw.decode("utf-8") or "null")
        except Exception:
            parsed = None
        return exc.code, parsed
    except URLError as exc:
        raise RuntimeError(f"请求失败 {url}: {exc}") from exc


def _check_expect(status: int, body: Any, expect: dict[str, Any]) -> list[str]:
    errs: list[str] = []
    if "status" in expect and status != expect["status"]:
        errs.append(f"status={status} 期望 {expect['status']}")
    if "jsonHas" in expect:
        key = expect["jsonHas"]
        if not isinstance(body, dict) or key.split(".")[0] not in body:
            # simple top-level
            ok = isinstance(body, dict)
            cur: Any = body
            for part in str(key).split("."):
                if not isinstance(cur, dict) or part not in cur:
                    ok = False
                    break
                cur = cur[part]
            if not ok:
                errs.append(f"json 缺少字段 {key}")
    if "jsonEquals" in expect and isinstance(expect["jsonEquals"], dict):
        if not isinstance(body, dict):
            errs.append("jsonEquals 需要对象响应")
        else:
            for k, v in expect["jsonEquals"].items():
                if body.get(k) != v:
                    errs.append(f"字段 {k}={body.get(k)!r} 期望 {v!r}")
    return errs


def verify_capability_auto(
    base: str,
    prefix: str,
    cap: dict[str, Any],
) -> tuple[str, list[str]]:
    """Return (status, errors). status: pass|fail|skip."""
    verify = cap.get("verify") if isinstance(cap.get("verify"), dict) else {}
    if verify.get("manual") and not verify.get("method"):
        return "skip", []
    method = verify.get("method")
    path = verify.get("path")
    if not method or not path:
        return "skip", []
    url_path = path if str(path).startswith("/") else "/" + str(path)
    url = base.rstrip("/") + (prefix or "") + url_path
    body = verify.get("body") if isinstance(verify.get("body"), dict) else None
    try:
        status, parsed = _http_json(str(method), url, body)
    except Exception as exc:
        return "fail", [str(exc)]
    expect = verify.get("expect") if isinstance(verify.get("expect"), dict) else {}
    errs = _check_expect(status, parsed, expect)
    return ("pass" if not errs else "fail"), errs


def check_module_dir(
    module_dir: Path,
    *,
    strict_manual: bool,
    live_base: str | None,
    live_prefix: str,
) -> list[str]:
    errors: list[str] = []
    manifest_path = module_dir / "module.json"
    if not manifest_path.is_file():
        return errors
    if module_dir.name.startswith(("_", ".")):
        return errors

    manifest = load_json(manifest_path)
    module_id = str(manifest.get("id") or module_dir.name)
    cpath = contract_path_for(module_dir)
    if not cpath.is_file():
        # Pure shell modules (echo) — OK without contract
        print(f"[skip] {module_id}: 无 {CONTRACT_FILENAME}（纯任务模块）")
        return errors

    try:
        contract, source, coverage = load_and_validate_contract(
            module_dir,
            module_id=module_id,
            require_source_file=True,
            require_manual_acceptance=strict_manual,
        )
    except IntegrationContractError as exc:
        errors.append(f"{module_id}: {exc}")
        print(f"[FAIL] {module_id}: {exc}")
        return errors

    print(f"[ok]   {module_id}: contract 结构 + must_keep 覆盖")
    if coverage.get("manual_pending"):
        msg = f"{module_id}: manual 未完成 {coverage['manual_pending']}"
        print(f"[WARN] {msg}")
        if strict_manual:
            errors.append(msg)

    if live_base and source:
        caps = source.get("capabilities") or []
        wired = {
            w["capability_id"]: w
            for w in contract.get("capability_wiring") or []
            if isinstance(w, dict)
        }
        for cap in caps:
            if not isinstance(cap, dict) or not cap.get("must_keep"):
                continue
            cid = cap.get("id")
            st, errs = verify_capability_auto(live_base, live_prefix, cap)
            if st == "skip":
                print(f"  - {cid}: manual/skip")
                continue
            if st == "fail":
                line = f"{module_id}/{cid}: " + "; ".join(errs)
                errors.append(line)
                print(f"  [FAIL] {line}")
            else:
                print(f"  [pass] {cid} via {live_prefix or '(direct)'}")
            # Ensure proxy wiring exists when endpoints present
            endpoints = cap.get("endpoints") or []
            if endpoints and cid in wired and wired[cid].get("wiring") == "proxy":
                if not wired[cid].get("proxy_paths"):
                    errors.append(f"{module_id}/{cid}: proxy wiring 缺 proxy_paths")

    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Check ke integration contracts")
    parser.add_argument(
        "--modules-dir",
        default=str(BACKEND_ROOT / "modules"),
        help="backend/modules path",
    )
    parser.add_argument(
        "--module",
        default=None,
        help="Only check this module folder name or id",
    )
    parser.add_argument(
        "--strict-manual",
        action="store_true",
        help="Fail if must_keep manual capabilities lack acceptance",
    )
    parser.add_argument(
        "--base",
        default=None,
        help="Live probe base URL (direct service or ke host)",
    )
    parser.add_argument(
        "--prefix",
        default="",
        help="Proxy prefix when probing via host, e.g. /download-api",
    )
    args = parser.parse_args(argv)

    modules_dir = Path(args.modules_dir)
    if not modules_dir.is_dir():
        print(f"modules dir missing: {modules_dir}", file=sys.stderr)
        return 2

    all_errors: list[str] = []
    for child in sorted(modules_dir.iterdir()):
        if not child.is_dir():
            continue
        if args.module:
            try:
                mid = load_json(child / "module.json").get("id")
            except Exception:
                mid = None
            if child.name != args.module and mid != args.module:
                continue
        all_errors.extend(
            check_module_dir(
                child,
                strict_manual=args.strict_manual,
                live_base=args.base,
                live_prefix=args.prefix or "",
            )
        )

    if all_errors:
        print(f"\nFAILED ({len(all_errors)}):")
        for e in all_errors:
            print(f"  - {e}")
        return 1
    print("\nAll contract checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
