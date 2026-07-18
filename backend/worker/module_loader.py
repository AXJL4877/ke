"""
Shell <-> modules boundary: scan modules/, import handlers, validate MODULE_SPEC.md.
Do not add module_id if-else branches here.
"""
from __future__ import annotations

import copy
import importlib
import importlib.util
import json
import logging
import sys
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from core.anti_mock import find_mock_schema_fields  # noqa: E402
from core.capabilities import CapabilitiesError, validate_capabilities  # noqa: E402
from core.integration_contract import (  # noqa: E402
    CONTRACT_FILENAME,
    IntegrationContractError,
    contract_path_for,
    load_and_validate_contract,
)
from modules._base import BaseModuleHandler, assert_handler_contract  # noqa: E402

REQUIRED_MANIFEST_KEYS = (
    "id",
    "name",
    "description",
    "version",
    "category",
    "input_schema",
    "output_schema",
    "runtime",
)


class ModuleLoadError(RuntimeError):
    pass


class ModuleLoader:
    def __init__(self, modules_dir: str | Path) -> None:
        self.modules_dir = Path(modules_dir)
        if not self.modules_dir.is_absolute():
            self.modules_dir = (BACKEND_ROOT / self.modules_dir).resolve()
        self._handlers: dict[str, Any] = {}
        self._manifests: dict[str, dict[str, Any]] = {}
        self._contracts: dict[str, dict[str, Any]] = {}
        self._load_warnings: dict[str, list[str]] = {}
        self._load_errors: list[str] = []
        self.reload()

    def reload(self) -> None:
        self._handlers.clear()
        self._manifests.clear()
        self._contracts.clear()
        self._load_warnings.clear()
        self._load_errors = []
        # Drop cached dynamic handler modules so file edits are picked up
        stale = [k for k in sys.modules if k.startswith("ke_modules.")]
        for k in stale:
            del sys.modules[k]
        if "modules._base" in sys.modules:
            importlib.reload(sys.modules["modules._base"])

        if not self.modules_dir.exists():
            logger.warning("modules dir missing: %s", self.modules_dir)
            return

        from api.config import get_settings

        settings = get_settings()

        load_errors: list[str] = []
        for child in sorted(self.modules_dir.iterdir()):
            if not child.is_dir() or child.name.startswith(("_", ".")):
                continue
            manifest_path = child / "module.json"
            handler_path = child / "handler.py"
            if not manifest_path.exists():
                continue
            try:
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                warnings = self._validate_manifest(
                    manifest,
                    folder=child.name,
                    require_capabilities=settings.require_capabilities,
                    capabilities_exempt=settings.capabilities_exempt_ids,
                    allow_mock=settings.allow_mock,
                )
                module_id = manifest["id"]
                if not handler_path.exists():
                    raise ModuleLoadError(f"{module_id}: handler.py required")

                contract, coverage = self._validate_integration_contract(
                    child,
                    module_id=module_id,
                    require_source=settings.require_integration_source,
                )
                if contract is not None:
                    self._contracts[module_id] = contract
                    if coverage and coverage.get("warnings"):
                        warnings.extend(coverage["warnings"])
                    if coverage and coverage.get("manual_pending"):
                        warnings.append(
                            "manual 能力未验收（verify 不会全绿）: "
                            + ", ".join(coverage["manual_pending"])
                        )
                    warnings.append(f"已校验 {CONTRACT_FILENAME}（must_keep 全覆盖）")

                handler = self._load_handler(child, module_id)
                assert_handler_contract(handler)
                self._manifests[module_id] = manifest
                self._load_warnings[module_id] = warnings
                self._handlers[module_id] = handler
                for w in warnings:
                    logger.warning("[%s] %s", module_id, w)
            except (ModuleLoadError, CapabilitiesError, IntegrationContractError) as exc:
                msg = str(exc)
                load_errors.append(msg)
                logger.error("skip module %s: %s", child.name, msg)
            except Exception as exc:
                msg = f"{child.name}: {exc}"
                load_errors.append(msg)
                logger.exception("failed to load module from %s: %s", child, exc)

        self._load_errors = load_errors
        if load_errors:
            logger.error(
                "module load errors (%d): %s",
                len(load_errors),
                "; ".join(load_errors),
            )

    def _validate_integration_contract(
        self,
        module_dir: Path,
        *,
        module_id: str,
        require_source: bool,
    ) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
        """If integration.contract.json exists, validate shape + must_keep coverage."""
        path = contract_path_for(module_dir)
        if not path.is_file():
            return None, None
        try:
            contract, _src, coverage = load_and_validate_contract(
                module_dir,
                module_id=module_id,
                require_source_file=require_source,
            )
        except IntegrationContractError:
            raise
        return contract, coverage
    def _validate_manifest(
        self,
        manifest: dict[str, Any],
        folder: str,
        *,
        require_capabilities: bool,
        capabilities_exempt: set[str],
        allow_mock: bool,
    ) -> list[str]:
        missing = [k for k in REQUIRED_MANIFEST_KEYS if k not in manifest]
        if missing:
            raise ModuleLoadError(f"{folder}: module.json missing required keys: {missing}")
        for key in ("input_schema", "output_schema", "runtime"):
            if not isinstance(manifest.get(key), dict):
                raise ModuleLoadError(f"{manifest.get('id')}: {key} must be object")

        module_id = str(manifest.get("id") or folder)
        warnings: list[str] = []

        need_caps = require_capabilities and module_id not in capabilities_exempt
        try:
            warnings.extend(
                validate_capabilities(
                    manifest.get("capabilities"),
                    module_id=module_id,
                    required=need_caps,
                )
            )
        except CapabilitiesError:
            raise

        mock_fields = find_mock_schema_fields(manifest.get("input_schema"))
        if mock_fields:
            warnings.append(
                f"input_schema 含演示/mock 相关字段 {mock_fields}；"
                "仅作提示，不拦截提交（结果仍可能标黄）"
            )

        return warnings

    def _load_handler(self, folder: Path, module_id: str) -> Any:
        path = folder / "handler.py"
        pkg = f"ke_modules.{module_id.replace('-', '_')}"
        # Allow sibling imports: `import client` / `from .client import ...`
        folder_str = str(folder.resolve())
        if folder_str not in sys.path:
            sys.path.insert(0, folder_str)

        spec = importlib.util.spec_from_file_location(
            f"{pkg}.handler",
            path,
            submodule_search_locations=[folder_str],
        )
        if spec is None or spec.loader is None:
            raise ModuleLoadError(f"cannot import handler for {module_id}")
        mod = importlib.util.module_from_spec(spec)
        mod.__package__ = pkg
        sys.modules[f"{pkg}.handler"] = mod
        sys.modules[pkg] = mod  # keep legacy alias used by reload()
        spec.loader.exec_module(mod)

        handler_cls = getattr(mod, "Handler", None)
        if isinstance(handler_cls, type) and issubclass(handler_cls, BaseModuleHandler):
            return handler_cls()
        if hasattr(mod, "handler"):
            return mod.handler
        if hasattr(mod, "run") and callable(mod.run):

            class _FnHandler(BaseModuleHandler):
                def run(self, params: dict[str, Any]) -> dict[str, Any]:
                    return mod.run(params)

            return _FnHandler()
        raise ModuleLoadError(
            f"{module_id}: handler.py must expose Handler(BaseModuleHandler), handler, or run()"
        )

    def list_manifests(self, *, for_api: bool = True) -> list[dict[str, Any]]:
        out = []
        for mid, raw in self._manifests.items():
            out.append(self.prepare_manifest(raw, for_api=for_api))
        return out

    def prepare_manifest(self, manifest: dict[str, Any], *, for_api: bool = True) -> dict[str, Any]:
        """Copy manifest; soft-warn on mock-like fields (do not strip)."""
        from api.config import get_settings

        m = copy.deepcopy(manifest)
        warnings = list(self._load_warnings.get(str(m.get("id")), []))
        settings = get_settings()
        mock_fields = find_mock_schema_fields(m.get("input_schema"))
        if mock_fields and for_api:
            warnings.append(f"提示：input_schema 含演示/mock 相关字段 {mock_fields}")
        mid = str(m.get("id") or "")
        m["_shell"] = {
            "warnings": warnings,
            "stripped_mock_fields": [],
            "mock_field_hints": mock_fields,
            "allow_mock": settings.allow_mock,
            "capabilities_ok": bool(m.get("capabilities")),
            "has_integration_contract": mid in self._contracts,
        }
        return m

    def get_manifest(self, module_id: str, *, for_api: bool = False) -> dict[str, Any] | None:
        raw = self._manifests.get(module_id)
        if raw is None:
            return None
        return self.prepare_manifest(raw, for_api=for_api)

    def get_raw_manifest(self, module_id: str) -> dict[str, Any] | None:
        return self._manifests.get(module_id)

    def get_contract(self, module_id: str) -> dict[str, Any] | None:
        return self._contracts.get(module_id)

    def get_load_warnings(self, module_id: str) -> list[str]:
        return list(self._load_warnings.get(module_id, []))

    def get_load_errors(self) -> list[str]:
        return list(self._load_errors)

    def get_handler(self, module_id: str) -> Any:
        if module_id not in self._handlers:
            self.reload()
        handler = self._handlers.get(module_id)
        if handler is None:
            raise ModuleLoadError(f"no handler registered for module_id={module_id!r}")
        return handler


_loader: ModuleLoader | None = None


def get_module_loader(*, force_reload: bool = False) -> ModuleLoader:
    global _loader
    if force_reload or _loader is None:
        from api.config import get_settings

        _loader = ModuleLoader(get_settings().modules_dir)
    return _loader
