const SECOND_MS = 1000
const DAY_MS = 86_400_000
const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      calendar: 'gregory',
      numberingSystem: 'latn',
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formatters.set(timeZone, formatter)
  }
  return formatter
}

export function utcMs(year: number, month: number, day: number, hour = 0, minute = 0, second = 0) {
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  date.setUTCHours(hour, minute, second, 0)
  return date.getTime()
}

function wallClockMs(ms: number, timeZone: string): number {
  const fields = new Map<string, number>()
  for (const { type, value } of formatterFor(timeZone).formatToParts(new Date(ms))) {
    fields.set(type, Number(value))
  }
  const read = (type: string) => fields.get(type) ?? 0
  return utcMs(
    read('year'),
    read('month'),
    read('day'),
    read('hour'),
    read('minute'),
    read('second'),
  )
}

function offsetAt(ms: number, timeZone: string): number {
  return wallClockMs(ms, timeZone) - Math.floor(ms / SECOND_MS) * SECOND_MS
}

function keyOfUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

export function parseDayKey(dayKey: string): number | null {
  const match = DAY_KEY.exec(dayKey)
  if (!match) return null
  const year = Number(match[1])
  if (year < 1) return null
  const ms = utcMs(year, Number(match[2]), Number(match[3]))
  return keyOfUtc(ms) === dayKey ? ms : null
}

function requireDayKey(dayKey: string): number {
  const ms = parseDayKey(dayKey)
  if (ms === null) throw new RangeError(`Invalid day key: ${dayKey}`)
  return ms
}

export function dayKeyOf(ms: number, timeZone: string): string {
  return keyOfUtc(wallClockMs(ms, timeZone))
}

export function addDays(dayKey: string, days: number): string {
  return keyOfUtc(requireDayKey(dayKey) + Math.trunc(days) * DAY_MS)
}

export function weekdayOf(dayKey: string): number {
  return new Date(requireDayKey(dayKey)).getUTCDay()
}

export function startOfDayMs(dayKey: string, timeZone: string): number {
  const wall = requireDayKey(dayKey)
  const before = offsetAt(wall - DAY_MS, timeZone)
  const after = offsetAt(wall + DAY_MS, timeZone)

  const candidates = before === after ? [wall - before] : [wall - before, wall - after]
  let earliest: number | null = null
  for (const candidate of candidates) {
    const isMidnight = offsetAt(candidate, timeZone) === wall - candidate
    if (isMidnight && (earliest === null || candidate < earliest)) earliest = candidate
  }
  if (earliest !== null) return earliest
  if (before >= after) return wall - before

  let low = wall - after
  let high = wall - before
  while (high - low > SECOND_MS) {
    const middle = low + Math.floor((high - low) / (2 * SECOND_MS)) * SECOND_MS
    if (offsetAt(middle, timeZone) === before) low = middle
    else high = middle
  }
  return high
}
