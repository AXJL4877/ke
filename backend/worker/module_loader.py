"""
Shell <-> modules boundary: scan modules/, import handlers, validate MODULE_SPEC.md.
Do not add module_id if-else branches here.
"""
from __future__ import annotations

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
        self.reload()

    def reload(self) -> None:
        self._handlers.clear()
        self._manifests.clear()
        # Drop cached dynamic handler modules so file edits are picked up
        stale = [k for k in sys.modules if k.startswith("ke_modules.")]
        for k in stale:
            del sys.modules[k]
        if "modules._base" in sys.modules:
            importlib.reload(sys.modules["modules._base"])

        if not self.modules_dir.exists():
            logger.warning("modules dir missing: %s", self.modules_dir)
            return

        for child in sorted(self.modules_dir.iterdir()):
            if not child.is_dir() or child.name.startswith(("_", ".")):
                continue
            manifest_path = child / "module.json"
            handler_path = child / "handler.py"
            if not manifest_path.exists():
                continue
            try:
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                self._validate_manifest(manifest, folder=child.name)
                module_id = manifest["id"]
                self._manifests[module_id] = manifest
                if not handler_path.exists():
                    raise ModuleLoadError(f"{module_id}: handler.py required")
                handler = self._load_handler(child, module_id)
                assert_handler_contract(handler)
                self._handlers[module_id] = handler
            except ModuleLoadError:
                raise
            except Exception as exc:
                logger.exception("failed to load module from %s: %s", child, exc)
                raise ModuleLoadError(str(exc)) from exc

    def _validate_manifest(self, manifest: dict[str, Any], folder: str) -> None:
        missing = [k for k in REQUIRED_MANIFEST_KEYS if k not in manifest]
        if missing:
            raise ModuleLoadError(f"{folder}: module.json missing required keys: {missing}")
        for key in ("input_schema", "output_schema", "runtime"):
            if not isinstance(manifest.get(key), dict):
                raise ModuleLoadError(f"{manifest.get('id')}: {key} must be object")

    def _load_handler(self, folder: Path, module_id: str) -> Any:
        path = folder / "handler.py"
        spec_name = f"ke_modules.{module_id.replace('-', '_')}"
        spec = importlib.util.spec_from_file_location(spec_name, path)
        if spec is None or spec.loader is None:
            raise ModuleLoadError(f"cannot import handler for {module_id}")
        mod = importlib.util.module_from_spec(spec)
        # Prefer function-style run() so handlers need not import BaseModuleHandler
        sys.modules[spec_name] = mod
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

    def list_manifests(self) -> list[dict[str, Any]]:
        return list(self._manifests.values())

    def get_manifest(self, module_id: str) -> dict[str, Any] | None:
        return self._manifests.get(module_id)

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
