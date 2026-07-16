"""
Forced handler interface (MODULE_SPEC.md section 4).
Each modules/<id>/handler.py must implement run(params) -> dict.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class BaseModuleHandler(ABC):
    @abstractmethod
    def run(self, params: dict[str, Any]) -> dict[str, Any]:
        """
        params: matches module.json input_schema (file fields are local path strings)
        return: matches output_schema (file outputs are URLs from storage.upload())
        """
        ...


# Alias for older drafts
ModuleHandler = BaseModuleHandler


def assert_handler_contract(obj: Any) -> None:
    run = getattr(obj, "run", None)
    if run is None or not callable(run):
        raise TypeError(
            f"Module handler {type(obj).__name__!r} must implement callable run(params) -> dict"
        )
