import { DEFAULT_LEAD_MS, DEFAULT_LINGER_MS, isSpanning, phaseOf } from './phase.ts'
import { dayKeyOf } from './timezone.ts'
import type { AgendaGroup, AgendaOptions, NormalizedEvent } from './types.ts'

function calendarRanks(events: readonly NormalizedEvent[]): Map<string, number> {
  const ranks = new Map<string, number>()
  for (const { calendarId } of events) {
    if (!ranks.has(calendarId)) ranks.set(calendarId, ranks.size)
  }
  return ranks
}

export function dedupeEvents(events: readonly NormalizedEvent[]): NormalizedEvent[] {
  const owners = new Map<string, string>()
  return events.filter((event) => {
    const identity = `${event.startMs}:${event.endMs}:${event.summary}`
    const owner = owners.get(identity)
    if (owner === undefined) owners.set(identity, event.calendarId)
    return owner === undefined || owner === event.calendarId
  })
}

export function buildAgenda(
  events: readonly NormalizedEvent[],
  options: AgendaOptions,
): AgendaGroup[] {
  const {
    nowMs,
    timeZone,
    leadMs = DEFAULT_LEAD_MS,
    lingerMs = DEFAULT_LINGER_MS,
    limit,
    day,
    dedupe = true,
  } = options
  const linger = Math.max(0, lingerMs)
  const today = dayKeyOf(nowMs, timeZone)
  const ranks = calendarRanks(events)
  const rankOf = (event: NormalizedEvent) => ranks.get(event.calendarId) ?? 0

  const live = events
    .filter((event) => {
      const { endMs, startDay, endDay } = event
      const visibleUntil = isSpanning(event) ? endMs : endMs + linger
      return nowMs < visibleUntil && (day === undefined || (startDay <= day && day <= endDay))
    })
    .toSorted((a, b) => a.startMs - b.startMs || rankOf(a) - rankOf(b))
  const unique = dedupe ? dedupeEvents(live) : live

  const groupDayOf = (event: NormalizedEvent) => {
    if (day !== undefined) return day
    return event.startDay > today ? event.startDay : today
  }

  const timed = unique.filter((event) => !isSpanning(event))
  const hasLimit = limit !== undefined && limit >= 0
  const kept = hasLimit ? timed.slice(0, limit) : timed
  const keptSet = new Set(kept)
  const lastKept = kept.at(-1)
  const cutDay = lastKept ? groupDayOf(lastKept) : (day ?? today)
  const horizon = kept.length < timed.length ? cutDay : null

  const groups = new Map<string, AgendaGroup>()
  for (const event of unique) {
    const spanning = isSpanning(event)
    if (!spanning && !keptSet.has(event)) continue
    const dayKey = groupDayOf(event)
    if (horizon !== null && dayKey > horizon) continue

    let group = groups.get(dayKey)
    if (!group) {
      group = { dayKey, allDay: [], timed: [] }
      groups.set(dayKey, group)
    }
    const item = { event, ...phaseOf(event, nowMs, leadMs) }
    if (spanning) group.allDay.push(item)
    else group.timed.push(item)
  }

  return [...groups.values()].toSorted((a, b) => (a.dayKey < b.dayKey ? -1 : 1))
}
