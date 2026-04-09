from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlmodel import Session, select

from app.models import Batch, Equipment, UnitOpKind, UnitOperation, UnitOpStatus


EQUIPMENT_NAMES = ["1.5L", "15L", "20L", "75L", "1500L"]


def _utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def seed_if_empty(session: Session) -> None:
    has_any = session.exec(select(Equipment.id).limit(1)).first()
    if has_any is not None:
        return

    equipment = [Equipment(name=name) for name in EQUIPMENT_NAMES]
    session.add_all(equipment)
    session.commit()
    for e in equipment:
        session.refresh(e)

    now = _utc(datetime.now())
    b1 = Batch(name="Batch A", start=now - timedelta(days=2), end=now + timedelta(days=18))
    b2 = Batch(name="Batch B", start=now + timedelta(days=1), end=now + timedelta(days=24))
    session.add_all([b1, b2])
    session.commit()
    session.refresh(b1)
    session.refresh(b2)

    ops: list[UnitOperation] = [
        UnitOperation(
            batch_id=b1.id,
            kind=UnitOpKind.seed,
            color="#3b82f6",
            status=UnitOpStatus.confirmed,
            equipment_id=equipment[0].id,
            start=b1.start + timedelta(days=0),
            end=b1.start + timedelta(days=3),
        ),
        UnitOperation(
            batch_id=b1.id,
            kind=UnitOpKind.bioreactor,
            color="#10b981",
            status=UnitOpStatus.confirmed,
            equipment_id=equipment[4].id,
            start=b1.start + timedelta(days=4),
            end=b1.start + timedelta(days=10),
        ),
        UnitOperation(
            batch_id=b1.id,
            kind=UnitOpKind.tff,
            color="#f59e0b",
            status=UnitOpStatus.draft,
            equipment_id=equipment[2].id,
            start=b1.start + timedelta(days=11),
            end=b1.start + timedelta(days=13),
        ),
        UnitOperation(
            batch_id=b2.id,
            kind=UnitOpKind.seed,
            color="#8b5cf6",
            status=UnitOpStatus.draft,
            equipment_id=equipment[1].id,
            start=b2.start + timedelta(days=0),
            end=b2.start + timedelta(days=4),
        ),
        UnitOperation(
            batch_id=b2.id,
            kind=UnitOpKind.bioreactor,
            color="#ef4444",
            status=UnitOpStatus.draft,
            equipment_id=equipment[4].id,
            start=b2.start + timedelta(days=2),
            end=b2.start + timedelta(days=9),
        ),
    ]

    session.add_all(ops)
    session.commit()

