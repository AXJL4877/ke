"""Echo sample module: proves registry + task pipeline (MODULE_SPEC.md)."""
from __future__ import annotations

from typing import Any


def run(params: dict[str, Any]) -> dict[str, Any]:
    message = params.get("message", "")
    # Demo hook for stage-error UI: message "__fail__" or fail=true
    if params.get("fail") is True or str(message).strip() == "__fail__":
        raise RuntimeError("演示失败：故意在 run 阶段抛出，用于验证节点明示报错")
    return {"echo": message}
