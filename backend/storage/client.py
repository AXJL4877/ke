"""
文件存储抽象层。
业务代码只调用 upload() / get_url()；切换 S3/OSS 只改本文件。
"""
from __future__ import annotations

import shutil
import uuid
from abc import ABC, abstractmethod
from pathlib import Path

from api.config import get_settings


class StorageClient(ABC):
    @abstractmethod
    def upload(self, local_path: str | Path, key: str | None = None, content_type: str | None = None) -> str:
        """上传文件，返回可公开访问的 URL（或需鉴权的资源标识）。"""

    @abstractmethod
    def get_url(self, key: str) -> str:
        """根据存储 key 生成访问 URL。"""

    @abstractmethod
    def delete(self, key: str) -> None:
        ...


class LocalStorageClient(StorageClient):
    def __init__(self, root: str | Path, public_base_url: str) -> None:
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.public_base_url = public_base_url.rstrip("/")

    def upload(self, local_path: str | Path, key: str | None = None, content_type: str | None = None) -> str:
        src = Path(local_path)
        key = key or f"{uuid.uuid4().hex}/{src.name}"
        dest = self.root / key
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest)
        return self.get_url(key)

    def get_url(self, key: str) -> str:
        return f"{self.public_base_url}/{key.lstrip('/')}"

    def delete(self, key: str) -> None:
        path = self.root / key
        if path.exists():
            path.unlink()


class S3StorageClient(StorageClient):
    """占位：接入 boto3 / MinIO 时实现。当前未装依赖时勿选用 storage_backend=s3。"""

    def __init__(self) -> None:
        raise NotImplementedError("S3 backend: install boto3 and configure STORAGE_S3_* env vars")

    def upload(self, local_path: str | Path, key: str | None = None, content_type: str | None = None) -> str:
        raise NotImplementedError

    def get_url(self, key: str) -> str:
        raise NotImplementedError

    def delete(self, key: str) -> None:
        raise NotImplementedError


_client: StorageClient | None = None


def get_storage() -> StorageClient:
    global _client
    if _client is not None:
        return _client
    settings = get_settings()
    if settings.storage_backend == "s3":
        _client = S3StorageClient()
    else:
        _client = LocalStorageClient(settings.storage_local_path, settings.storage_public_base_url)
    return _client
