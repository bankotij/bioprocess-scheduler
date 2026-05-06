import { useEffect, useMemo, useState } from 'react'
import { fetchSchedule } from './api'
import { addDays, startOfDay } from './date'
import type { Schedule } from './types'
import { Scheduler } from './components/Scheduler'
import './App.css'

function scheduleStats(s: Schedule) {
  const violations = s.unit_operations.reduce((n, o) => n + o.violations.length, 0)
  return {
    equipment: s.equipment.length,
    batches: s.batches.length,
    operations: s.unit_operations.length,
    dependencies: s.dependencies.length,
    violations,
  }
}

function App() {
  const [visibleStart, setVisibleStart] = useState(() => startOfDay(addDays(new Date(), -3)))
  const [visibleEnd, setVisibleEnd] = useState(() => startOfDay(addDays(new Date(), 17)))
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [slowHint, setSlowHint] = useState(false)

  const rangeLabel = useMemo(() => {
    const a = visibleStart.toLocaleDateString()
    const b = visibleEnd.toLocaleDateString()
    return `${a} → ${b}`
  }, [visibleStart, visibleEnd])

  const stats = useMemo(() => (schedule ? scheduleStats(schedule) : null), [schedule])

  async function reload() {
    setError(null)
    setSlowHint(false)
    setLoading(true)
    try {
      const data = await fetchSchedule(visibleStart, visibleEnd)
      setSchedule(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!loading) return
    const t = window.setTimeout(() => setSlowHint(true), 4000)
    return () => window.clearTimeout(t)
  }, [loading])

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleStart.getTime(), visibleEnd.getTime()])

  function onRangeQuick(days: number) {
    const s = startOfDay(new Date())
    setVisibleStart(addDays(s, -Math.floor(days / 4)))
    setVisibleEnd(addDays(s, days))
  }

  return (
    <div className="app">
      <header className="appHero">
        <div className="appHeroTop">
          <p className="appEyebrow">Bioprocess operations</p>
          <h1 className="appTitle">Scheduler</h1>
        </div>
        <p className="appLead">
          A lane-based Gantt for manufacturing-style runs: each row is an equipment line; bars are
          unit operations tied to batches. The API enforces ordering, capacity, and overlap rules—what
          you see here stays in sync with those checks.
        </p>
        <ul className="appHighlights">
          <li>
            <strong>Drag intent</strong> — click operations to inspect, create, or adjust (server
            validates every change).
          </li>
          <li>
            <strong>Dependencies & violations</strong> — dependency edges and red flags surface when
            the plan breaks rules.
          </li>
          <li>
            <strong>Time window</strong> — use the range controls below to focus the slice you care
            about.
          </li>
        </ul>
      </header>

      {stats ? (
        <div className="statRow" aria-label="Schedule summary">
          <div className="statCard">
            <span className="statValue">{stats.equipment}</span>
            <span className="statLabel">Equipment lanes</span>
          </div>
          <div className="statCard">
            <span className="statValue">{stats.batches}</span>
            <span className="statLabel">Batches</span>
          </div>
          <div className="statCard">
            <span className="statValue">{stats.operations}</span>
            <span className="statLabel">Unit operations</span>
          </div>
          <div className="statCard">
            <span className="statValue">{stats.dependencies}</span>
            <span className="statLabel">Dependencies</span>
          </div>
          <div className={`statCard ${stats.violations > 0 ? 'statCardWarn' : ''}`}>
            <span className="statValue">{stats.violations}</span>
            <span className="statLabel">Open violations</span>
          </div>
        </div>
      ) : null}

      <div className="rangeBar">
        <div className="rangeLeft">
          <div className="rangeTitle">Visible range</div>
          <div className="rangeValue">{rangeLabel}</div>
        </div>
        <div className="rangeRight">
          <div className="rangeInputs">
            <label className="rangeInput">
              <span>Start</span>
              <input
                type="date"
                value={visibleStart.toISOString().slice(0, 10)}
                onChange={(e) => setVisibleStart(startOfDay(new Date(e.target.value)))}
              />
            </label>
            <label className="rangeInput">
              <span>End</span>
              <input
                type="date"
                value={visibleEnd.toISOString().slice(0, 10)}
                onChange={(e) => setVisibleEnd(startOfDay(new Date(e.target.value)))}
              />
            </label>
          </div>
          <div className="rangeQuick">
            <button onClick={() => onRangeQuick(14)}>2w</button>
            <button onClick={() => onRangeQuick(30)}>1m</button>
            <button onClick={() => onRangeQuick(60)}>2m</button>
          </div>
          <button className="rangeBtn" onClick={reload} disabled={loading}>
            {loading ? 'Loading…' : 'Reload'}
          </button>
        </div>
      </div>

      {error ? <div className="pageError">{error}</div> : null}

      {schedule ? (
        <Scheduler schedule={schedule} visibleStart={visibleStart} visibleEnd={visibleEnd} onReload={reload} />
      ) : (
        <div className="emptyState">
          <div className="emptyStateTitle">{loading ? 'Loading schedule…' : 'No data'}</div>
          {loading && slowHint ? (
            <p className="emptyStateHint">
              First request after idle can take a bit while the API wakes up — the chart will appear as
              soon as data arrives.
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}

export default App
