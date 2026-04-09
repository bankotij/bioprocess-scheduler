from __future__ import annotations

from datetime import datetime
from enum import Enum

from sqlmodel import Field, SQLModel


class UnitOpStatus(str, Enum):
    draft = "draft"
    confirmed = "confirmed"
    completed = "completed"


class UnitOpKind(str, Enum):
    seed = "Seed"
    bioreactor = "Bioreactor"
    tff = "TFF"
    spray = "Spray"
    sum = "Sum"


KIND_ORDER: dict[UnitOpKind, int] = {
    UnitOpKind.seed: 0,
    UnitOpKind.bioreactor: 1,
    UnitOpKind.tff: 2,
    UnitOpKind.spray: 3,
    UnitOpKind.sum: 4,
}


class Equipment(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True)


class Batch(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True, unique=True)
    start: datetime
    end: datetime


class UnitOperation(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    kind: UnitOpKind = Field(index=True)
    color: str
    status: UnitOpStatus = Field(default=UnitOpStatus.draft, index=True)
    start: datetime = Field(index=True)
    end: datetime = Field(index=True)
    batch_id: int = Field(foreign_key="batch.id", index=True)
    equipment_id: int = Field(foreign_key="equipment.id", index=True)


class UnitOperationDependency(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    from_unitop_id: int = Field(foreign_key="unitoperation.id", index=True)
    to_unitop_id: int = Field(foreign_key="unitoperation.id", index=True)

