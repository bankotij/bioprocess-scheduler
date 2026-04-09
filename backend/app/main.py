from __future__ import annotations

from datetime import datetime, timezone
import os
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select

from app.constraints import recompute_dependencies_for_batch, validate_unit_op
from app.db import get_session, init_db
from app.models import Batch, Equipment, UnitOperation, UnitOperationDependency
from app.schemas import (
    BatchOut,
    DependencyOut,
    EquipmentOut,
    ScheduleOut,
    UnitOpCreate,
    UnitOpOut,
    UnitOpUpdate,
    Violation,
)
from app.seed import seed_if_empty


app = FastAPI(title="BBP Scheduler API", version="0.1.0")

allowed_origins = [
    o.strip()
    for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _as_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


@app.on_event("startup")
def _startup() -> None:
    init_db()
    with next(get_session()) as session:
        seed_if_empty(session)
        batch_ids = session.exec(select(Batch.id)).all()
        for bid in batch_ids:
            recompute_dependencies_for_batch(session, bid)


@app.get("/api/schedule", response_model=ScheduleOut)
def get_schedule(
    start_date: Annotated[datetime, Query(...)],
    end_date: Annotated[datetime, Query(...)],
    session: Session = Depends(get_session),
) -> ScheduleOut:
    start_date = _as_utc(start_date)
    end_date = _as_utc(end_date)
    if end_date <= start_date:
        raise HTTPException(status_code=400, detail="end_date must be after start_date")

    equipment = session.exec(select(Equipment).order_by(Equipment.name.asc())).all()
    batches = session.exec(select(Batch).order_by(Batch.name.asc())).all()

    ops = session.exec(
        select(UnitOperation).where(UnitOperation.end > start_date).where(UnitOperation.start < end_date)
    ).all()

    deps = session.exec(select(UnitOperationDependency)).all()

    op_out: list[UnitOpOut] = []
    for op in ops:
        v = validate_unit_op(session, op)
        op_out.append(
            UnitOpOut(
                id=op.id,
                kind=op.kind,
                color=op.color,
                status=op.status,
                start=op.start,
                end=op.end,
                batch_id=op.batch_id,
                equipment_id=op.equipment_id,
                violations=[Violation(code=x.code, message=x.message) for x in v],
            )
        )

    return ScheduleOut(
        start_date=start_date,
        end_date=end_date,
        equipment=[EquipmentOut(id=e.id, name=e.name) for e in equipment],
        batches=[BatchOut(id=b.id, name=b.name, start=b.start, end=b.end) for b in batches],
        unit_operations=op_out,
        dependencies=[DependencyOut(id=d.id, from_unitop_id=d.from_unitop_id, to_unitop_id=d.to_unitop_id) for d in deps],
    )


@app.post("/api/unit_operations", response_model=UnitOpOut)
def create_unit_op(payload: UnitOpCreate, session: Session = Depends(get_session)) -> UnitOpOut:
    op = UnitOperation(**payload.model_dump())
    op.start = _as_utc(op.start)
    op.end = _as_utc(op.end)
    session.add(op)
    session.commit()
    session.refresh(op)

    recompute_dependencies_for_batch(session, op.batch_id)
    v = validate_unit_op(session, op)

    return UnitOpOut(
        id=op.id,
        kind=op.kind,
        color=op.color,
        status=op.status,
        start=op.start,
        end=op.end,
        batch_id=op.batch_id,
        equipment_id=op.equipment_id,
        violations=[Violation(code=x.code, message=x.message) for x in v],
    )


@app.put("/api/unit_operations/{op_id}", response_model=UnitOpOut)
def update_unit_op(op_id: int, payload: UnitOpUpdate, session: Session = Depends(get_session)) -> UnitOpOut:
    op = session.get(UnitOperation, op_id)
    if op is None:
        raise HTTPException(status_code=404, detail="Unit operation not found")

    before_batch_id = op.batch_id
    patch = payload.model_dump(exclude_unset=True)
    for k, v in patch.items():
        setattr(op, k, v)

    op.start = _as_utc(op.start)
    op.end = _as_utc(op.end)
    session.add(op)
    session.commit()
    session.refresh(op)

    recompute_dependencies_for_batch(session, op.batch_id)
    if before_batch_id != op.batch_id:
        recompute_dependencies_for_batch(session, before_batch_id)

    v = validate_unit_op(session, op)
    return UnitOpOut(
        id=op.id,
        kind=op.kind,
        color=op.color,
        status=op.status,
        start=op.start,
        end=op.end,
        batch_id=op.batch_id,
        equipment_id=op.equipment_id,
        violations=[Violation(code=x.code, message=x.message) for x in v],
    )


@app.delete("/api/unit_operations/{op_id}")
def delete_unit_op(op_id: int, session: Session = Depends(get_session)) -> dict:
    op = session.get(UnitOperation, op_id)
    if op is None:
        raise HTTPException(status_code=404, detail="Unit operation not found")
    batch_id = op.batch_id
    session.delete(op)
    session.commit()
    recompute_dependencies_for_batch(session, batch_id)
    return {"ok": True}

