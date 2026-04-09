import { useEffect, useMemo, useRef, useState } from 'react'
import type { Batch, Equipment, Schedule, UnitOperation, UnitOpKind, UnitOpStatus } from '../types'
import { addDays, diffDays, formatDayLabel, startOfDay } from '../date'
import { createUnitOp, deleteUnitOp, updateUnitOp } from '../api'
import { Modal } from './Modal'
import './scheduler.css'

const DAY_PX = 44
const ROW_H = 56
const OP_H = 22
const OP_GAP = 4

function parseIso(s: string): Date {
  return new Date(s)
}

function toIsoInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const x = new Date(d)
  const yyyy = x.getFullYear()
  const mm = pad(x.getMonth() + 1)
  const dd = pad(x.getDate())
  const hh = pad(x.getHours())
  const mi = pad(x.getMinutes())
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`
}

function fromIsoInputValue(s: string): Date {
  return new Date(s)
}

type Rect = { x: number; y: number; w: number; h: number }

function kindLabel(kind: UnitOpKind): string {
  return kind
}

function statusBadge(status: UnitOpStatus): string {
  if (status === 'draft') return 'Draft'
  if (status === 'confirmed') return 'Confirmed'
  return 'Completed'
}

export function Scheduler({
  schedule,
  visibleStart,
  visibleEnd,
  onReload,
}: {
  schedule: Schedule
  visibleStart: Date
  visibleEnd: Date
  onReload: () => Promise<void>
}) {
  const timelineRef = useRef<HTMLDivElement | null>(null)
  const headerRef = useRef<HTMLDivElement | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const batchById = useMemo(() => new Map(schedule.batches.map((b) => [b.id, b])), [schedule.batches])
  const opById = useMemo(() => new Map(schedule.unit_operations.map((o) => [o.id, o])), [schedule.unit_operations])
  const selected = selectedId != null ? opById.get(selectedId) ?? null : null

  const days = useMemo(() => {
    const start = startOfDay(visibleStart)
    const end = startOfDay(visibleEnd)
    const count = Math.max(1, diffDays(start, end))
    return Array.from({ length: count }, (_, i) => addDays(start, i))
  }, [visibleStart, visibleEnd])

  const opsByEquipment = useMemo(() => {
    const m = new Map<number, UnitOperation[]>()
    for (const op of schedule.unit_operations) {
      const arr = m.get(op.equipment_id) ?? []
      arr.push(op)
      m.set(op.equipment_id, arr)
    }
    for (const [k, arr] of m) {
      arr.sort((a, b) => parseIso(a.start).getTime() - parseIso(b.start).getTime())
      m.set(k, arr)
    }
    return m
  }, [schedule.unit_operations])

  const layout = useMemo(() => {
    const opRects = new Map<number, Rect>()
    const batchBounds = new Map<number, Rect>()

    for (let laneIdx = 0; laneIdx < schedule.equipment.length; laneIdx++) {
      const eq = schedule.equipment[laneIdx]
      const ops = opsByEquipment.get(eq.id) ?? []

      const stacks: UnitOperation[][] = []
      for (const op of ops) {
        const s = parseIso(op.start)
        const e = parseIso(op.end)
        const x = (diffDays(startOfDay(visibleStart), s) + (s.getHours() + s.getMinutes() / 60) / 24) * DAY_PX
        const w = Math.max(
          8,
          ((e.getTime() - s.getTime()) / (24 * 60 * 60 * 1000)) * DAY_PX,
        )

        let stackIdx = 0
        for (; stackIdx < stacks.length; stackIdx++) {
          const last = stacks[stackIdx][stacks[stackIdx].length - 1]
          const lastEnd = parseIso(last.end)
          if (lastEnd <= s) break
        }
        if (!stacks[stackIdx]) stacks[stackIdx] = []
        stacks[stackIdx].push(op)

        const yBase = laneIdx * ROW_H + 10
        const y = yBase + stackIdx * (OP_H + OP_GAP)
        opRects.set(op.id, { x, y, w, h: OP_H })
      }
    }

    for (const op of schedule.unit_operations) {
      const r = opRects.get(op.id)
      if (!r) continue
      const b = batchBounds.get(op.batch_id)
      if (!b) {
        batchBounds.set(op.batch_id, { ...r })
      } else {
        const x1 = Math.min(b.x, r.x)
        const y1 = Math.min(b.y, r.y)
        const x2 = Math.max(b.x + b.w, r.x + r.w)
        const y2 = Math.max(b.y + b.h, r.y + r.h)
        batchBounds.set(op.batch_id, { x: x1, y: y1, w: x2 - x1, h: y2 - y1 })
      }
    }

    return { opRects, batchBounds }
  }, [schedule.equipment, schedule.unit_operations, opsByEquipment, visibleStart])

  const gridW = days.length * DAY_PX
  const gridH = schedule.equipment.length * ROW_H

  useEffect(() => {
    const t = timelineRef.current
    const h = headerRef.current
    if (!t || !h) return
    h.scrollLeft = t.scrollLeft
  }, [gridW])

  async function run<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
    setError(null)
    setBusy(label)
    try {
      return await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return null
    } finally {
      setBusy(null)
    }
  }

  const kinds: UnitOpKind[] = ['Seed', 'Bioreactor', 'TFF', 'Spray', 'Sum']
  const statuses: UnitOpStatus[] = ['draft', 'confirmed', 'completed']

  return (
    <div className="scheduler">
      <div className="toolbar">
        <div className="toolbarLeft">
          <div className="title">Bioprocess Scheduler</div>
          <div className="subtle">
            {days.length} days · {schedule.equipment.length} equipment lanes
          </div>
        </div>
        <div className="toolbarRight">
          {error ? <div className="error">{error}</div> : null}
          <button className="btn" onClick={() => setCreating(true)} disabled={busy != null}>
            New UnitOp
          </button>
          <button className="btn btnGhost" onClick={onReload} disabled={busy != null}>
            Refresh
          </button>
        </div>
      </div>

      <div className="gridShell">
        <div className="gridHeader">
          <div className="laneHeader">Equipment</div>
          <div className="datesViewport" ref={headerRef}>
            <div className="datesHeader" style={{ width: gridW }}>
              {days.map((d) => (
                <div key={d.toISOString()} className="dayCell" style={{ width: DAY_PX }}>
                  {formatDayLabel(d)}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="gridBody">
          <div className="laneLabels">
            {schedule.equipment.map((e) => (
              <div key={e.id} className="laneLabel" style={{ height: ROW_H }}>
                <div className="laneName">{e.name}</div>
              </div>
            ))}
          </div>

          <div
            className="timelineViewport"
            ref={timelineRef}
            onScroll={() => {
              const t = timelineRef.current
              const h = headerRef.current
              if (!t || !h) return
              h.scrollLeft = t.scrollLeft
            }}
          >
            <div className="timelineContent" style={{ width: gridW, height: gridH }}>
              <div className="gridBg" style={{ width: gridW, height: gridH }}>
                {days.map((d) => (
                  <div key={d.toISOString()} className="gridCol" style={{ width: DAY_PX }} />
                ))}
              </div>

              <div className="envelopes" style={{ width: gridW, height: gridH }}>
                {Array.from(layout.batchBounds.entries()).map(([batchId, r]) => {
                  const b = batchById.get(batchId)
                  if (!b) return null
                  const pad = 6
                  const labelW = Math.min(220, r.w)
                  return (
                    <div
                      key={batchId}
                      className="batchEnvelope"
                      style={{
                        left: r.x - pad,
                        top: r.y - pad,
                        width: r.w + pad * 2,
                        height: r.h + pad * 2,
                      }}
                      title={`${b.name} (${new Date(b.start).toLocaleDateString()} – ${new Date(b.end).toLocaleDateString()})`}
                    >
                      <div className="batchLabel" style={{ maxWidth: labelW }}>
                        {b.name}
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="ops" style={{ width: gridW, height: gridH }}>
                {schedule.unit_operations.map((op) => {
                  const r = layout.opRects.get(op.id)
                  if (!r) return null
                  const b = batchById.get(op.batch_id)
                  const hasViolations = op.violations.length > 0
                  const title = [
                    `${b?.name ?? `Batch ${op.batch_id}`} · ${kindLabel(op.kind)}`,
                    `${new Date(op.start).toLocaleString()} → ${new Date(op.end).toLocaleString()}`,
                    `Status: ${statusBadge(op.status)}`,
                    hasViolations ? `Violations:\n- ${op.violations.map((v) => v.message).join('\n- ')}` : '',
                  ]
                    .filter(Boolean)
                    .join('\n')

                  return (
                    <button
                      key={op.id}
                      className={`op ${hasViolations ? 'opBad' : ''}`}
                      style={{
                        left: r.x,
                        top: r.y,
                        width: r.w,
                        height: r.h,
                        background: op.color,
                      }}
                      onClick={() => setSelectedId(op.id)}
                      title={title}
                    >
                      <span className="opText">
                        {kindLabel(op.kind)} · {b?.name ?? `Batch ${op.batch_id}`}
                      </span>
                      {hasViolations ? <span className="opWarn">!</span> : null}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {selected ? (
        <EditUnitOpModal
          op={selected}
          batches={schedule.batches}
          equipment={schedule.equipment}
          statuses={statuses}
          onClose={() => setSelectedId(null)}
          onSave={async (patch) => {
            const res = await run('Saving…', () => updateUnitOp(selected.id, patch))
            if (!res) return
            await onReload()
            setSelectedId(null)
          }}
          onDelete={async () => {
            const ok = window.confirm('Delete this UnitOp?')
            if (!ok) return
            const res = await run('Deleting…', async () => {
              await deleteUnitOp(selected.id)
            })
            if (res === null) return
            await onReload()
            setSelectedId(null)
          }}
        />
      ) : null}

      {creating ? (
        <CreateUnitOpModal
          batches={schedule.batches}
          equipment={schedule.equipment}
          kinds={kinds}
          statuses={statuses}
          visibleStart={visibleStart}
          onClose={() => setCreating(false)}
          onCreate={async (payload) => {
            const res = await run('Creating…', () => createUnitOp(payload))
            if (!res) return
            await onReload()
            setCreating(false)
          }}
        />
      ) : null}

      {busy ? <div className="toast">{busy}</div> : null}
    </div>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="fieldRow">
      <div className="fieldLabel">{label}</div>
      <div className="fieldControl">{children}</div>
    </label>
  )
}

function EditUnitOpModal({
  op,
  batches,
  equipment,
  statuses,
  onClose,
  onSave,
  onDelete,
}: {
  op: UnitOperation
  batches: Batch[]
  equipment: Equipment[]
  statuses: UnitOpStatus[]
  onClose: () => void
  onSave: (patch: { start?: string; end?: string; equipment_id?: number; status?: UnitOpStatus; color?: string }) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [start, setStart] = useState(toIsoInputValue(parseIso(op.start)))
  const [end, setEnd] = useState(toIsoInputValue(parseIso(op.end)))
  const [equipmentId, setEquipmentId] = useState(op.equipment_id)
  const [status, setStatus] = useState<UnitOpStatus>(op.status)
  const [color, setColor] = useState(op.color)

  const batch = batches.find((b) => b.id === op.batch_id)

  return (
    <Modal title={`Edit UnitOp #${op.id}`} onClose={onClose}>
      <div className="modalGrid">
        <div className="summaryCard">
          <div className="summaryTitle">{batch?.name ?? `Batch ${op.batch_id}`}</div>
          <div className="summaryLine">{kindLabel(op.kind)}</div>
          <div className="summaryLine">{statusBadge(op.status)}</div>
          {op.violations.length ? (
            <div className="violations">
              <div className="violationsTitle">Backend warnings</div>
              <ul>
                {op.violations.map((v) => (
                  <li key={v.code + v.message}>{v.message}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="okPill">No backend warnings</div>
          )}
        </div>

        <div className="formCard">
          <FieldRow label="Start">
            <input className="input" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          </FieldRow>
          <FieldRow label="End">
            <input className="input" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
          </FieldRow>
          <FieldRow label="Equipment">
            <select className="input" value={equipmentId} onChange={(e) => setEquipmentId(Number(e.target.value))}>
              {equipment.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.name}
                </option>
              ))}
            </select>
          </FieldRow>
          <FieldRow label="Status">
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value as UnitOpStatus)}>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {statusBadge(s)}
                </option>
              ))}
            </select>
          </FieldRow>
          <FieldRow label="Color">
            <input className="input" type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </FieldRow>

          <div className="actions">
            <button
              className="btn"
              onClick={() =>
                onSave({
                  start: fromIsoInputValue(start).toISOString(),
                  end: fromIsoInputValue(end).toISOString(),
                  equipment_id: equipmentId,
                  status,
                  color,
                })
              }
            >
              Save changes
            </button>
            <button className="btn btnDanger" onClick={onDelete}>
              Delete
            </button>
          </div>
        </div>
      </div>
      <div className="finePrint">
        Batch window: {batch ? `${new Date(batch.start).toLocaleString()} → ${new Date(batch.end).toLocaleString()}` : '—'}
      </div>
    </Modal>
  )
}

function CreateUnitOpModal({
  batches,
  equipment,
  kinds,
  statuses,
  visibleStart,
  onClose,
  onCreate,
}: {
  batches: Batch[]
  equipment: Equipment[]
  kinds: UnitOpKind[]
  statuses: UnitOpStatus[]
  visibleStart: Date
  onClose: () => void
  onCreate: (payload: {
    kind: UnitOpKind
    color: string
    status: UnitOpStatus
    start: string
    end: string
    batch_id: number
    equipment_id: number
  }) => Promise<void>
}) {
  const defaultBatchId = batches[0]?.id ?? 1
  const defaultEquipmentId = equipment[0]?.id ?? 1

  const [batchId, setBatchId] = useState(defaultBatchId)
  const [kind, setKind] = useState<UnitOpKind>(kinds[0])
  const [equipmentId, setEquipmentId] = useState(defaultEquipmentId)
  const [status, setStatus] = useState<UnitOpStatus>(statuses[0])
  const [color, setColor] = useState('#3b82f6')

  const start0 = startOfDay(visibleStart)
  const [start, setStart] = useState(toIsoInputValue(addDays(start0, 1)))
  const [end, setEnd] = useState(toIsoInputValue(addDays(start0, 3)))

  return (
    <Modal title="Create UnitOp" onClose={onClose}>
      <div className="formCard">
        <div className="formGrid2">
          <FieldRow label="Batch">
            <select className="input" value={batchId} onChange={(e) => setBatchId(Number(e.target.value))}>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </FieldRow>
          <FieldRow label="Kind">
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value as UnitOpKind)}>
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </FieldRow>
          <FieldRow label="Equipment">
            <select className="input" value={equipmentId} onChange={(e) => setEquipmentId(Number(e.target.value))}>
              {equipment.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.name}
                </option>
              ))}
            </select>
          </FieldRow>
          <FieldRow label="Status">
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value as UnitOpStatus)}>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {statusBadge(s)}
                </option>
              ))}
            </select>
          </FieldRow>
          <FieldRow label="Start">
            <input className="input" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          </FieldRow>
          <FieldRow label="End">
            <input className="input" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
          </FieldRow>
          <FieldRow label="Color">
            <input className="input" type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </FieldRow>
        </div>
        <div className="actions">
          <button
            className="btn"
            onClick={() =>
              onCreate({
                kind,
                color,
                status,
                start: fromIsoInputValue(start).toISOString(),
                end: fromIsoInputValue(end).toISOString(),
                batch_id: batchId,
                equipment_id: equipmentId,
              })
            }
          >
            Create
          </button>
          <button className="btn btnGhost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  )
}

