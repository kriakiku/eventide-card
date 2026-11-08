import { DEFAULT_LEAD_MS, DEFAULT_LINGER_MS } from '../core/phase.ts'
import { compileRules } from '../core/rules.ts'
import type { CompiledRules, Rule } from '../core/types.ts'

export type View = 'auto' | 'month' | 'week' | 'none'

export interface CalendarConfig {
  entity: string
  color?: string
  name?: string
}

export interface EventideConfig {
  type?: string
  calendars: Array<string | CalendarConfig>
  view?: View
  lead_time?: number
  linger?: number
  limit?: number
  dedupe?: boolean
  rules?: Rule[]
}

export interface ResolvedCalendar {
  entity: string
  color: string
  name?: string
}

export interface ResolvedConfig {
  calendars: ResolvedCalendar[]
  view: View
  leadMs: number
  lingerMs: number
  limit: number
  dedupe: boolean
  rules: CompiledRules
}

const MINUTE = 60_000
const VIEWS: readonly View[] = ['auto', 'month', 'week', 'none']
const PALETTE = ['#7F77DD', '#E0704A', '#2FA98C', '#D4537E', '#378ADD', '#BA7517']
export const DEFAULT_LIMIT = 5

function count(name: string, value: unknown, fallback: number): number {
  if (value === undefined) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a number of 0 or more`)
  }
  return value
}

function resolveCalendar(item: string | CalendarConfig, index: number): ResolvedCalendar {
  const calendar = typeof item === 'string' ? { entity: item } : item
  if (typeof calendar?.entity !== 'string' || !calendar.entity.startsWith('calendar.')) {
    throw new Error(`calendars[${index}] must be a calendar entity`)
  }
  return {
    entity: calendar.entity,
    color: calendar.color ?? PALETTE[index % PALETTE.length] ?? '#7F77DD',
    ...(calendar.name === undefined ? {} : { name: calendar.name }),
  }
}

export function resolveConfig(raw: EventideConfig): ResolvedConfig {
  if (!Array.isArray(raw?.calendars) || raw.calendars.length === 0) {
    throw new Error('calendars must list at least one calendar entity')
  }
  const view = raw.view ?? 'auto'
  if (!VIEWS.includes(view)) throw new Error(`view must be one of ${VIEWS.join(', ')}`)
  return {
    calendars: raw.calendars.map(resolveCalendar),
    view,
    leadMs: count('lead_time', raw.lead_time, DEFAULT_LEAD_MS / MINUTE) * MINUTE,
    lingerMs: count('linger', raw.linger, DEFAULT_LINGER_MS / MINUTE) * MINUTE,
    limit: count('limit', raw.limit, DEFAULT_LIMIT),
    dedupe: raw.dedupe ?? true,
    rules: compileRules(raw.rules ?? []),
  }
}
