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
    capabilities: list[dict[str, Any]] | None = None
    # 业务进度环节（见 TASK_PROGRESS.md）
    progress_pipeline: list[str] | None = None
    progress_preset: str | None = None
    # Shell-injected metadata (anti-mock + capabilities DoD)
    shell: dict[str, Any] | None = None


class IntegrationReportOut(BaseModel):
    module_id: str
    ok: bool
    capabilities_declared: int
    must_keep_count: int
    auto_verify_count: int
    manual_verify_count: int
    items: list[dict[str, Any]]
    message: str
    warnings: list[str] = Field(default_factory=list)
    stripped_mock_fields: list[str] = Field(default_factory=list)
    allow_mock: bool = False
