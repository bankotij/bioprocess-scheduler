import { useEffect, useMemo, useState } from 'react'
import { fetchSchedule } from './api'
import { addDays, startOfDay } from './date'
import type { Schedule } from './types'
import { Scheduler } from './components/Scheduler'
import './App.css'

function App() {
  const [visibleStart, setVisibleStart] = useState(() => startOfDay(addDays(new Date(), -3)))
  const [visibleEnd, setVisibleEnd] = useState(() => startOfDay(addDays(new Date(), 17)))
  const [schedule, setSchedule] = useState<Schedule | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const rangeLabel = useMemo(() => {
    const a = visibleStart.toLocaleDateString()
    const b = visibleEnd.toLocaleDateString()
    return `${a} → ${b}`
  }, [visibleStart, visibleEnd])

  async function reload() {
    setError(null)
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
        <div className="emptyState">Loading schedule…</div>
      )}
    </div>
  )
}

export default App
