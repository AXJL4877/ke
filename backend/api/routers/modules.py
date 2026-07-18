from fastapi import APIRouter, HTTPException

from api.config import get_settings
from api.schemas.module import IntegrationReportOut, ModuleManifestOut
from core.capabilities import integration_report
from worker.module_loader import get_module_loader

router = APIRouter()


def _to_out(manifest: dict) -> ModuleManifestOut:
    return ModuleManifestOut(
        id=manifest["id"],
        name=manifest["name"],
        description=manifest["description"],
        version=manifest["version"],
        category=manifest["category"],
        input_schema=manifest.get("input_schema") or {},
        output_schema=manifest.get("output_schema") or {},
        ui_hint=manifest.get("ui_hint"),
        runtime=manifest.get("runtime") or {},
        local=manifest.get("local"),
        capabilities=manifest.get("capabilities"),
        shell=manifest.get("_shell"),
    )


@router.get("", response_model=list[ModuleManifestOut])
def list_modules() -> list[ModuleManifestOut]:
    """返回所有模块 manifest（已剥离 mock 字段），供前端 DynamicForm 消费。"""
    loader = get_module_loader(force_reload=False)
    manifests = loader.list_manifests(for_api=True)
    return [_to_out(m) for m in manifests]


@router.get("/load-errors")
def module_load_errors() -> dict:
    """加载失败的模块（缺 capabilities / handler 等），不阻塞其他模块。"""
    loader = get_module_loader(force_reload=False)
    return {"errors": loader.get_load_errors()}


@router.post("/reload", response_model=list[ModuleManifestOut])
def reload_modules() -> list[ModuleManifestOut]:
    """开发用：强制重扫 modules/ 并热加载 handler。"""
    loader = get_module_loader(force_reload=True)
    manifests = loader.list_manifests(for_api=True)
    return [_to_out(m) for m in manifests]


@router.get("/{module_id}/integration", response_model=IntegrationReportOut)
def module_integration(module_id: str) -> IntegrationReportOut:
    """
    接入完成定义(DoD)：capabilities 清单 + must_keep 宿主动作。
    用于防止「只接主 endpoint、漏掉 cookies 等小功能」。
    """
    loader = get_module_loader(force_reload=False)
    prepared = loader.get_manifest(module_id, for_api=True)
    raw = loader.get_raw_manifest(module_id)
    if prepared is None or raw is None:
        raise HTTPException(status_code=404, detail=f"module not found: {module_id}")

    report = integration_report(raw)
    shell = prepared.get("_shell") or {}
    settings = get_settings()
    return IntegrationReportOut(
        module_id=report["module_id"],
        ok=report["ok"],
        capabilities_declared=report["capabilities_declared"],
        must_keep_count=report["must_keep_count"],
        auto_verify_count=report["auto_verify_count"],
        manual_verify_count=report["manual_verify_count"],
        items=report["items"],
        message=report["message"],
        warnings=list(shell.get("warnings") or []),
        stripped_mock_fields=list(shell.get("stripped_mock_fields") or []),
        allow_mock=settings.allow_mock,
    )
