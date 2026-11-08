import { addDays, dayKeyOf, parseDayKey, startOfDayMs, utcMs } from './timezone.ts'
import type { NormalizeContext, NormalizedEvent } from './types.ts'

const DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(?:Z|([+-])(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)$/

type WireTime = { kind: 'date'; day: string } | { kind: 'instant'; ms: number }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseInstant(text: string): number | null {
  const match = DATE_TIME.exec(text)
  if (!match) return null
  const [, year, month, day, hour, minute, second, fraction, sign, offsetH, offsetM, offsetS] =
    match

  const dayMs = parseDayKey(`${year}-${month}-${day}`)
  const [h, m, s] = [Number(hour), Number(minute), Number(second ?? 0)]
  if (dayMs === null || h > 23 || m > 59 || s > 59) return null

  const [oh, om, os] = [Number(offsetH ?? 0), Number(offsetM ?? 0), Number(offsetS ?? 0)]
  if (oh > 23 || om > 59 || os > 59) return null

  const offsetMs = (oh * 3600 + om * 60 + os) * 1000 * (sign === '-' ? -1 : 1)
  const millis = Number((fraction ?? '').padEnd(3, '0').slice(0, 3))
  const wall = utcMs(Number(year), Number(month), Number(day), h, m, s) + millis
  return wall - offsetMs
}

function parseText(text: string): WireTime | null {
  if (parseDayKey(text) !== null) return { kind: 'date', day: text }
  const ms = parseInstant(text)
  return ms === null ? null : { kind: 'instant', ms }
}

function parseWireTime(value: unknown): WireTime | null {
  if (typeof value === 'string') return parseText(value)
  if (!isRecord(value)) return null
  if (typeof value.dateTime === 'string') {
    const ms = parseInstant(value.dateTime)
    return ms === null ? null : { kind: 'instant', ms }
  }
  if (typeof value.date === 'string' && parseDayKey(value.date) !== null) {
    return { kind: 'date', day: value.date }
  }
  return null
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

interface Span {
  startMs: number
  endMs: number
  allDay: boolean
  startDay: string
  endDay: string
}

function resolveSpan(start: WireTime, end: WireTime, timeZone: string): Span | null {
  if (start.kind === 'date' && end.kind === 'date') {
    if (end.day < start.day) return null
    const exclusiveEnd = end.day === start.day ? addDays(start.day, 1) : end.day
    if (parseDayKey(exclusiveEnd) === null) return null
    return {
      startMs: startOfDayMs(start.day, timeZone),
      endMs: startOfDayMs(exclusiveEnd, timeZone),
      allDay: true,
      startDay: start.day,
      endDay: addDays(exclusiveEnd, -1),
    }
  }
  if (start.kind === 'instant' && end.kind === 'instant') {
    if (end.ms < start.ms) return null
    const startDay = dayKeyOf(start.ms, timeZone)
    return {
      startMs: start.ms,
      endMs: end.ms,
      allDay: false,
      startDay,
      endDay: end.ms > start.ms ? dayKeyOf(end.ms - 1, timeZone) : startDay,
    }
  }
  return null
}

export function normalizeEvent(raw: unknown, context: NormalizeContext): NormalizedEvent | null {
  if (!isRecord(raw) || typeof raw.summary !== 'string') return null
  const start = parseWireTime(raw.start)
  const end = parseWireTime(raw.end)
  if (!start || !end) return null
  const span = resolveSpan(start, end, context.timeZone)
  if (!span) return null

  const uid = optionalText(raw.uid)
  return {
    key: JSON.stringify([
      context.calendarId,
      uid,
      optionalText(raw.recurrence_id),
      span.startMs,
      uid === null ? [raw.summary, span.endMs] : null,
    ]),
    seriesId: uid ?? raw.summary,
    calendarId: context.calendarId,
    summary: raw.summary,
    description: optionalText(raw.description),
    location: optionalText(raw.location),
    ...span,
  }
}

export function normalizeEvents(raw: unknown, context: NormalizeContext): NormalizedEvent[] {
  if (!Array.isArray(raw)) return []
  const seen = new Map<string, number>()
  const events: NormalizedEvent[] = []
  for (const item of raw as unknown[]) {
    const event = normalizeEvent(item, context)
    if (!event) continue
    const count = (seen.get(event.key) ?? 0) + 1
    seen.set(event.key, count)
    events.push(count === 1 ? event : { ...event, key: `${event.key}#${count}` })
  }
  return events
}
