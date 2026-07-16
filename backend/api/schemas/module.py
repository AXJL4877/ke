from typing import Any

from pydantic import BaseModel, Field


class ModuleManifestOut(BaseModel):
    id: str
    name: str
    description: str
    version: str | int
    category: str
    input_schema: dict[str, Any] = Field(default_factory=dict)
    output_schema: dict[str, Any] = Field(default_factory=dict)
    ui_hint: dict[str, Any] | str | None = None
    runtime: dict[str, Any] = Field(default_factory=dict)
    local: dict[str, Any] | None = None
