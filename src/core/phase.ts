import type { EventStatus, NormalizedEvent } from './types.ts'

export const DEFAULT_LEAD_MS = 3_600_000
export const DEFAULT_LINGER_MS = 1_800_000

const SPANNING_MS = 86_400_000

type Timed = Pick<NormalizedEvent, 'allDay' | 'startMs' | 'endMs'>

function clampFill(value: number): number {
  return Math.min(1, Math.max(0, value))
}

export function isSpanning(event: Timed): boolean {
  return event.allDay || event.endMs - event.startMs >= SPANNING_MS
}

export function phaseOf(event: Timed, nowMs: number, leadMs = DEFAULT_LEAD_MS): EventStatus {
  const spanning = isSpanning(event)
  const msUntilStart = Math.max(0, event.startMs - nowMs)
  const msUntilEnd = Math.max(0, event.endMs - nowMs)
  const msSinceEnd = Math.max(0, nowMs - event.endMs)
  const times = { msUntilStart, msUntilEnd, msSinceEnd }
  const idleFill = spanning ? null : 0

  if (nowMs >= event.endMs) return { phase: 'finished', fill: idleFill, ...times }
  if (nowMs >= event.startMs) {
    const fill = spanning ? null : clampFill(msUntilEnd / (event.endMs - event.startMs))
    return { phase: 'running', fill, ...times }
  }
  if (!spanning && leadMs > 0 && msUntilStart <= leadMs) {
    return { phase: 'soon', fill: clampFill(1 - msUntilStart / leadMs), ...times }
  }
  return { phase: 'later', fill: idleFill, ...times }
}
