from fastapi import APIRouter

from api.config import get_settings
from api.schemas.module import ModuleManifestOut
from worker.module_loader import ModuleLoader

router = APIRouter()


@router.get("", response_model=list[ModuleManifestOut])
def list_modules() -> list[ModuleManifestOut]:
    """返回所有模块 manifest，供前端 _registry / DynamicForm 消费。"""
    settings = get_settings()
    loader = ModuleLoader(settings.modules_dir)
    manifests = loader.list_manifests()
    return [ModuleManifestOut(**m) for m in manifests]
