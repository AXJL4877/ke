"""Echo sample module: proves registry + task pipeline (MODULE_SPEC.md)."""
from __future__ import annotations

from typing import Any


def run(params: dict[str, Any]) -> dict[str, Any]:
    return {"echo": params.get("message", "")}
