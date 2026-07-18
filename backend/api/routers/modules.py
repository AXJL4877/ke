from fastapi import APIRouter

from api.schemas.module import ModuleManifestOut
from worker.module_loader import get_module_loader

router = APIRouter()


@router.get("", response_model=list[ModuleManifestOut])
def list_modules() -> list[ModuleManifestOut]:
    """返回所有模块 manifest，供前端 _registry / DynamicForm 消费。"""
    loader = get_module_loader(force_reload=False)
    manifests = loader.list_manifests()
    return [ModuleManifestOut(**m) for m in manifests]


@router.post("/reload", response_model=list[ModuleManifestOut])
def reload_modules() -> list[ModuleManifestOut]:
    """开发用：强制重扫 modules/ 并热加载 handler。"""
    loader = get_module_loader(force_reload=True)
    manifests = loader.list_manifests()
    return [ModuleManifestOut(**m) for m in manifests]
