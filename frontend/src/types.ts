export type Equipment = { id: number; name: string }

export type Batch = { id: number; name: string; start: string; end: string }

export type Violation = { code: string; message: string }

export type UnitOpKind = 'Seed' | 'Bioreactor' | 'TFF' | 'Spray' | 'Sum'
export type UnitOpStatus = 'draft' | 'confirmed' | 'completed'

export type UnitOperation = {
  id: number
  kind: UnitOpKind
  color: string
  status: UnitOpStatus
  start: string
  end: string
  batch_id: number
  equipment_id: number
  violations: Violation[]
}

export type Dependency = {
  id: number
  from_unitop_id: number
  to_unitop_id: number
}

export type Schedule = {
  start_date: string
  end_date: string
  equipment: Equipment[]
  batches: Batch[]
  unit_operations: UnitOperation[]
  dependencies: Dependency[]
}

