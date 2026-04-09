from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.models import UnitOpKind, UnitOpStatus


class UnitOpBase(BaseModel):
    kind: UnitOpKind
    color: str = Field(min_length=1)
    status: UnitOpStatus
    start: datetime
    end: datetime
    batch_id: int
    equipment_id: int


class UnitOpCreate(UnitOpBase):
    pass


class UnitOpUpdate(BaseModel):
    color: str | None = None
    status: UnitOpStatus | None = None
    start: datetime | None = None
    end: datetime | None = None
    batch_id: int | None = None
    equipment_id: int | None = None


class Violation(BaseModel):
    code: str
    message: str


class UnitOpOut(UnitOpBase):
    id: int
    violations: list[Violation] = []


class EquipmentOut(BaseModel):
    id: int
    name: str


class BatchOut(BaseModel):
    id: int
    name: str
    start: datetime
    end: datetime


class DependencyOut(BaseModel):
    id: int
    from_unitop_id: int
    to_unitop_id: int


class ScheduleOut(BaseModel):
    start_date: datetime
    end_date: datetime
    equipment: list[EquipmentOut]
    batches: list[BatchOut]
    unit_operations: list[UnitOpOut]
    dependencies: list[DependencyOut]

