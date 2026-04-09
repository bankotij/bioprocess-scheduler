from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlmodel import Session, select

from app.models import Batch, KIND_ORDER, UnitOpKind, UnitOperation, UnitOperationDependency


@dataclass(frozen=True)
class Violation:
    code: str
    message: str


def _overlaps(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime) -> bool:
    return a_start < b_end and b_start < a_end


def validate_unit_op(session: Session, op: UnitOperation) -> list[Violation]:
    violations: list[Violation] = []

    if op.end <= op.start:
        violations.append(Violation("time.invalid_range", "End must be after start."))

    batch = session.get(Batch, op.batch_id)
    if batch is None:
        violations.append(Violation("batch.missing", "Batch does not exist."))
        return violations

    if op.start < batch.start or op.end > batch.end:
        violations.append(Violation("batch.outside_window", "UnitOp must be within the batch window."))

    q = select(UnitOperation).where(UnitOperation.equipment_id == op.equipment_id)
    if op.id is not None:
        q = q.where(UnitOperation.id != op.id)
    for other in session.exec(q).all():
        if _overlaps(op.start, op.end, other.start, other.end):
            violations.append(
                Violation(
                    "equipment.overlap",
                    f"Overlaps with UnitOp {other.id} on the same equipment.",
                )
            )
            break

    all_ops = session.exec(select(UnitOperation).where(UnitOperation.batch_id == op.batch_id)).all()
    earlier_kinds = [k for k, idx in KIND_ORDER.items() if idx < KIND_ORDER[op.kind]]
    for other in all_ops:
        if other.id == op.id:
            continue
        if other.kind in earlier_kinds and other.end > op.start:
            violations.append(
                Violation(
                    "sequence.order",
                    f"Starts before prior step ({other.kind.value}) ends.",
                )
            )
            break

    later_kinds = [k for k, idx in KIND_ORDER.items() if idx > KIND_ORDER[op.kind]]
    for other in all_ops:
        if other.id == op.id:
            continue
        if other.kind in later_kinds and op.end > other.start:
            violations.append(
                Violation(
                    "sequence.order",
                    f"Ends after a later step ({other.kind.value}) starts.",
                )
            )
            break

    deps = session.exec(
        select(UnitOperationDependency).where(
            (UnitOperationDependency.from_unitop_id == op.id)
            | (UnitOperationDependency.to_unitop_id == op.id)
        )
    ).all()
    for dep in deps:
        if dep.from_unitop_id == op.id:
            to_op = session.get(UnitOperation, dep.to_unitop_id)
            if to_op and op.end > to_op.start:
                violations.append(Violation("dependency.after", f"Must end before dependent UnitOp {to_op.id} starts."))
        if dep.to_unitop_id == op.id:
            from_op = session.get(UnitOperation, dep.from_unitop_id)
            if from_op and from_op.end > op.start:
                violations.append(Violation("dependency.before", f"Must start after dependency UnitOp {from_op.id} ends."))

    return violations


def recompute_dependencies_for_batch(session: Session, batch_id: int) -> None:
    ops = session.exec(select(UnitOperation).where(UnitOperation.batch_id == batch_id)).all()
    by_kind: dict[UnitOpKind, UnitOperation] = {op.kind: op for op in ops}

    existing = session.exec(
        select(UnitOperationDependency).where(
            UnitOperationDependency.from_unitop_id.in_([op.id for op in ops if op.id is not None])
        )
    ).all()
    for dep in existing:
        session.delete(dep)
    session.commit()

    ordered_kinds = sorted(by_kind.keys(), key=lambda k: KIND_ORDER[k])
    for i in range(len(ordered_kinds) - 1):
        a = by_kind[ordered_kinds[i]]
        b = by_kind[ordered_kinds[i + 1]]
        if a.id is None or b.id is None:
            continue
        session.add(UnitOperationDependency(from_unitop_id=a.id, to_unitop_id=b.id))
    session.commit()

