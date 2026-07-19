from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from api.config import get_settings
from api.middleware.cors import add_cors
from api.middleware.error_handler import register_exception_handlers
from api.routers import assets, auth, modules, tasks
from core.logging import setup_logging
from db.base import Base
from db import models as _models  # noqa: F401 — register tables for create_all
from db.session import engine
from pathlib import Path

setup_logging()
settings = get_settings()

app = FastAPI(title="KE Studio API", version="0.1.0")
add_cors(app)
register_exception_handlers(app)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(modules.router, prefix="/api/modules", tags=["modules"])
app.include_router(tasks.router, prefix="/api/tasks", tags=["tasks"])
app.include_router(assets.router, prefix="/api/assets", tags=["assets"])

# 本地存储静态挂载（生产应走 CDN / 预签名 URL）
local_path = Path(settings.storage_local_path)
local_path.mkdir(parents=True, exist_ok=True)
app.mount("/files", StaticFiles(directory=str(local_path)), name="files")


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
