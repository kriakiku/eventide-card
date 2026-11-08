import type { NormalizedEvent } from './types.ts'

export const DEFAULT_CANCELLED_PATTERN =
  '^\\s*(?:cancell?ed|отменено|скасовано|abgesagt|annulé|cancelado|atšaukta)\\s*[:：]\\s*'

export function markCancelled(
  events: readonly NormalizedEvent[],
  pattern: RegExp | null,
): NormalizedEvent[] {
  if (pattern === null) return [...events]
  return events.map((event) => {
    if (!pattern.test(event.summary)) return event
    const summary = event.summary.replace(pattern, '').trim()
    return { ...event, cancelled: true, summary: summary === '' ? event.summary : summary }
  })
}
