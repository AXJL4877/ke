#!/usr/bin/env python3
"""
Generate integration.contract.json skeleton from a source module.json.

  cd ke/backend
  $env:PYTHONPATH="."
  python -m scripts.gen_contract --source ../../video_download/module.json --module-id cj-download --out modules/cj-download/integration.contract.json
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from core.integration_contract import (  # noqa: E402
    build_contract_skeleton_from_source,
    load_json,
    sha256_file,
)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--source", required=True, help="Path to source module.json")
    p.add_argument("--module-id", required=True, help="ke module id")
    p.add_argument("--out", required=True, help="Output contract path")
    p.add_argument(
        "--manifest-path",
        default=None,
        help="Path string to store in contract.source.manifest_path (default: relative from ke root)",
    )
    p.add_argument("--fingerprint", action="store_true", help="Write manifest_sha256")
    args = p.parse_args(argv)

    src = Path(args.source).resolve()
    if not src.is_file():
        print(f"source not found: {src}", file=sys.stderr)
        return 2

    ke_root = BACKEND_ROOT.parent
    try:
        rel = src.relative_to(ke_root.parent)  # mo_kuai/...
        default_mp = str(Path("..") / rel).replace("\\", "/")
    except ValueError:
        default_mp = str(src)

    manifest_path = args.manifest_path or default_mp
    source = load_json(src)
    skeleton = build_contract_skeleton_from_source(
        source, module_id=args.module_id, manifest_path=manifest_path
    )
    if args.fingerprint:
        skeleton["source"]["manifest_sha256"] = sha256_file(src)

    # Seed empty manual_acceptance rows for manual must_keep
    manuals = []
    for cap in source.get("capabilities") or []:
        if not isinstance(cap, dict) or not cap.get("must_keep"):
            continue
        verify = cap.get("verify") if isinstance(cap.get("verify"), dict) else {}
        if verify.get("manual") and not verify.get("method"):
            manuals.append(
                {
                    "capability_id": cap["id"],
                    "accepted": False,
                    "note": "接入验收后改为 true，并写明步骤与日期",
                }
            )
    skeleton["manual_acceptance"] = manuals

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(skeleton, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {out}")
    print(
        f"must_keep wired: {len(skeleton['capability_wiring'])}; "
        f"manual pending: {len(manuals)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
