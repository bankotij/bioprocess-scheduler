export function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function addDays(d: Date, days: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + days)
  return x
}

export function diffDays(a: Date, b: Date): number {
  const ms = startOfDay(b).getTime() - startOfDay(a).getTime()
  return Math.round(ms / (24 * 60 * 60 * 1000))
}

export function clampDate(d: Date, min: Date, max: Date): Date {
  const t = d.getTime()
  return new Date(Math.min(Math.max(t, min.getTime()), max.getTime()))
}

export function formatDayLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: '2-digit' })
}

