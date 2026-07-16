from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class TaskCreate(BaseModel):
    module_id: str
    input_params: dict[str, Any] = Field(default_factory=dict)


class TaskOut(BaseModel):
    id: UUID
    module_id: str
    input_params: dict[str, Any]
    status: str
    result: dict[str, Any] | None
    error_message: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
