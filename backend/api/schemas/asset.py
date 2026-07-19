from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class AssetCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    kind: str = Field(default="file", max_length=32)
    module_id: str = Field(default="", max_length=128)
    source_service: str | None = None
    mime: str | None = None
    text_content: str | None = None
    url: str | None = None
    tags: list[str] = Field(default_factory=list)
    meta: dict = Field(default_factory=dict)
    provenance: dict = Field(default_factory=dict)


class AssetUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    tags: list[str] | None = None
    meta: dict | None = None


class AssetListItem(BaseModel):
    id: str
    title: str
    kind: str
    module_id: str
    source_service: str | None = None
    task_id: str | None = None
    source: str
    mime: str | None = None
    url: str | None = None
    has_file: bool = False
    has_text: bool = False
    preview: str | None = None
    tags: list[str] = Field(default_factory=list)
    created_at: datetime | None = None
    updated_at: datetime | None = None


class AssetOut(AssetListItem):
    text_content: str | None = None
    storage_key: str | None = None
    bytes_size: int | None = None
    checksum: str | None = None
    meta: dict = Field(default_factory=dict)
    provenance: dict = Field(default_factory=dict)
