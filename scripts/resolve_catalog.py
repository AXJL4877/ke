#!/usr/bin/env python3
"""
Resolve / list modules from ke/modules.catalog.json.

  cd ke
  python scripts/resolve_catalog.py list
  python scripts/resolve_catalog.py recipe collect-transcript
  python scripts/resolve_catalog.py resolve transcript download
  python scripts/resolve_catalog.py clone-cmds transcript
  python scripts/resolve_catalog.py paths tts
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

KE_ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = KE_ROOT / "modules.catalog.json"


def load_catalog() -> dict[str, Any]:
    data = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or not isinstance(data.get("modules"), list):
        raise SystemExit(f"invalid catalog: {CATALOG_PATH}")
    return data


def index_modules(catalog: dict[str, Any]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for m in catalog["modules"]:
        if not isinstance(m, dict):
            continue
        sid = str(m.get("service_id") or "")
        if sid:
            out[sid] = m
    return out


def expand_with_deps(ids: list[str], by_id: dict[str, dict[str, Any]]) -> list[str]:
    """BFS: requested ids + transitive depends_on. Preserve stable order."""
    seen: set[str] = set()
    ordered: list[str] = []

    def add(sid: str) -> None:
        if sid in seen:
            return
        if sid not in by_id:
            raise SystemExit(f"unknown service_id: {sid}")
        for dep in by_id[sid].get("depends_on") or []:
            add(str(dep))
        if sid not in seen:
            seen.add(sid)
            ordered.append(sid)

    for sid in ids:
        add(sid)
    return ordered


def candidate_paths(mod: dict[str, Any]) -> list[Path]:
    folder = mod["folder"]
    return [
        KE_ROOT / "deps" / folder,
        KE_ROOT.parent / folder,
        KE_ROOT.parent / "mo_kuai" / folder,
        Path.home() / "Desktop" / "mo_kuai" / folder,
        Path.home() / "Desktop" / folder,
    ]


def find_local(mod: dict[str, Any]) -> Path | None:
    for p in candidate_paths(mod):
        if (p / "module.json").is_file():
            return p.resolve()
    return None


def cmd_list(catalog: dict[str, Any]) -> int:
    print(f"catalog: {CATALOG_PATH}")
    print(f"owner:   {catalog.get('owner')}")
    print()
    for m in catalog["modules"]:
        deps = ",".join(m.get("depends_on") or []) or "-"
        local = find_local(m)
        loc = str(local) if local else "(not found locally)"
        print(
            f"  {m['service_id']:12}  port={m['default_port']:<5}  "
            f"deps={deps:20}  {m['name']}"
        )
        print(f"               git={m['git_url']}")
        print(f"               local={loc}")
    print()
    recipes = catalog.get("recipes") or []
    if recipes:
        print("recipes:")
        for r in recipes:
            mods = ",".join(r.get("modules") or [])
            print(f"  {r['id']:22}  [{mods}]  {r.get('name')}")
    return 0


def cmd_recipe(catalog: dict[str, Any], recipe_id: str) -> int:
    by_id = index_modules(catalog)
    for r in catalog.get("recipes") or []:
        if r.get("id") == recipe_id:
            expanded = expand_with_deps(list(r.get("modules") or []), by_id)
            print(json.dumps({"recipe": r, "expanded": expanded}, ensure_ascii=False, indent=2))
            return 0
    raise SystemExit(f"unknown recipe: {recipe_id}")


def cmd_resolve(catalog: dict[str, Any], ids: list[str]) -> int:
    by_id = index_modules(catalog)
    expanded = expand_with_deps(ids, by_id)
    rows = []
    for sid in expanded:
        m = by_id[sid]
        local = find_local(m)
        rows.append(
            {
                "service_id": sid,
                "folder": m["folder"],
                "label": m["label"],
                "git_url": m["git_url"],
                "default_port": m["default_port"],
                "depends_on": m.get("depends_on") or [],
                "proxy_prefixes": m.get("proxy_prefixes") or [],
                "local_path": str(local) if local else None,
                "must_keep_highlights": m.get("must_keep_highlights") or [],
                "notes": m.get("notes") or "",
            }
        )
    print(json.dumps({"requested": ids, "expanded": expanded, "modules": rows}, ensure_ascii=False, indent=2))
    return 0


def cmd_clone_cmds(catalog: dict[str, Any], ids: list[str], dest: str) -> int:
    by_id = index_modules(catalog)
    expanded = expand_with_deps(ids, by_id)
    dest_root = Path(dest)
    print(f"# clone into {dest_root.resolve()}")
    print(f"New-Item -ItemType Directory -Force -Path '{dest_root}' | Out-Null")
    for sid in expanded:
        m = by_id[sid]
        target = dest_root / m["folder"]
        if (target / "module.json").is_file():
            print(f"# exists: {target}")
            continue
        print(f'git clone "{m["git_url"]}" "{target}"')
    return 0


def cmd_paths(catalog: dict[str, Any], ids: list[str]) -> int:
    by_id = index_modules(catalog)
    for sid in expand_with_deps(ids, by_id):
        m = by_id[sid]
        print(f"[{sid}]")
        for p in candidate_paths(m):
            mark = "OK" if (p / "module.json").is_file() else "  "
            print(f"  {mark}  {p}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="KE modules.catalog helper")
    sub = parser.add_subparsers(dest="cmd", required=True)

    sub.add_parser("list", help="List all modules and recipes")

    p_recipe = sub.add_parser("recipe", help="Show recipe and expanded deps")
    p_recipe.add_argument("id")

    p_resolve = sub.add_parser("resolve", help="Expand ids + local paths as JSON")
    p_resolve.add_argument("ids", nargs="+")

    p_clone = sub.add_parser("clone-cmds", help="Print git clone commands")
    p_clone.add_argument("ids", nargs="+")
    p_clone.add_argument(
        "--dest",
        default=str(KE_ROOT / "deps"),
        help="Clone destination (default: ke/deps)",
    )

    p_paths = sub.add_parser("paths", help="Show candidate local paths")
    p_paths.add_argument("ids", nargs="+")

    args = parser.parse_args(argv)
    catalog = load_catalog()

    if args.cmd == "list":
        return cmd_list(catalog)
    if args.cmd == "recipe":
        return cmd_recipe(catalog, args.id)
    if args.cmd == "resolve":
        return cmd_resolve(catalog, args.ids)
    if args.cmd == "clone-cmds":
        return cmd_clone_cmds(catalog, args.ids, args.dest)
    if args.cmd == "paths":
        return cmd_paths(catalog, args.ids)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
