import type { Schedule, UnitOperation, UnitOpKind, UnitOpStatus } from './types'

export async function fetchSchedule(start: Date, end: Date): Promise<Schedule> {
  const qs = new URLSearchParams({
    start_date: start.toISOString(),
    end_date: end.toISOString(),
  })
  const res = await fetch(`/api/schedule?${qs.toString()}`)
  if (!res.ok) throw new Error(`Failed to load schedule (${res.status})`)
  return (await res.json()) as Schedule
}

export type UnitOpCreate = {
  kind: UnitOpKind
  color: string
  status: UnitOpStatus
  start: string
  end: string
  batch_id: number
  equipment_id: number
}

export type UnitOpUpdate = Partial<UnitOpCreate>

export async function createUnitOp(payload: UnitOpCreate): Promise<UnitOperation> {
  const res = await fetch(`/api/unit_operations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`Failed to create UnitOp (${res.status})`)
  return (await res.json()) as UnitOperation
}

export async function updateUnitOp(id: number, payload: UnitOpUpdate): Promise<UnitOperation> {
  const res = await fetch(`/api/unit_operations/${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`Failed to update UnitOp (${res.status})`)
  return (await res.json()) as UnitOperation
}

export async function deleteUnitOp(id: number): Promise<void> {
  const res = await fetch(`/api/unit_operations/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Failed to delete UnitOp (${res.status})`)
}

