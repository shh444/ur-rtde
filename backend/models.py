from __future__ import annotations

from typing import Any, List, Optional

from pydantic import BaseModel, Field


class ConfigRequest(BaseModel):
    frequency_hz: Optional[float] = Field(default=None, gt=0)
    fields: Optional[List[str]] = None
    history_seconds: Optional[float] = Field(default=None, gt=1)
    history_sample_hz: Optional[float] = Field(default=None, gt=0)
    robot_model: Optional[str] = None
    restart_if_running: bool = True


class WriteRequest(BaseModel):
    field: str
    value: Any


class RecordingRequest(BaseModel):
    label: Optional[str] = None


class SnapshotExportRequest(BaseModel):
    label: Optional[str] = None
