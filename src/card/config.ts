import { DEFAULT_CANCELLED_PATTERN } from '../core/cancelled.ts'
import { DEFAULT_LEAD_MS, DEFAULT_LINGER_MS } from '../core/phase.ts'
import { compileRules } from '../core/rules.ts'
import type { CompiledRules, Rule } from '../core/types.ts'
import { TRANSLATION_KEYS, WEEKDAYS, type Translation, type Translations } from './format.ts'

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
  first_weekday?: string
  time_format?: string | number
  today_color?: string
  show_clock?: boolean
  show_navigation?: boolean
  series_colors?: boolean
  translations?: Translations
  show_cancelled?: boolean
  cancelled_match?: string
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
  firstWeekday?: string
  timeFormat?: string
  todayColor?: string
  showClock: boolean
  showNavigation: boolean
  seriesColors: boolean
  translations: Translations
  showCancelled: boolean
  cancelledPattern: RegExp | null
  rules: CompiledRules
}

const MINUTE = 60_000
const VIEWS: readonly View[] = ['auto', 'month', 'week', 'none']
const PALETTE = ['#7F77DD', '#E0704A', '#2FA98C', '#D4537E', '#378ADD', '#BA7517']
const TIME_FORMATS = ['12', '24', 'language']
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

function resolveCancelledPattern(raw: unknown): RegExp | null {
  if (raw === '') return null
  if (raw !== undefined && typeof raw !== 'string') throw new Error('cancelled_match must be text')
  try {
    return new RegExp(raw ?? DEFAULT_CANCELLED_PATTERN, 'iu')
  } catch {
    throw new Error('cancelled_match is not a valid pattern')
  }
}

function resolveTranslations(raw: unknown): Translations {
  if (raw === undefined) return {}
  if (typeof raw !== 'object' || raw === null) throw new Error('translations must be a map')
  const resolved: Translations = {}
  for (const [language, entries] of Object.entries(raw)) {
    if (typeof entries !== 'object' || entries === null) {
      throw new Error(`translations.${language} must be a map`)
    }
    const translation: Translation = {}
    for (const [key, value] of Object.entries(entries)) {
      const known = TRANSLATION_KEYS.find((name) => name === key)
      if (!known) {
        throw new Error(
          `translations.${language}: unknown key ${key}, use ${TRANSLATION_KEYS.join(', ')}`,
        )
      }
      if (typeof value !== 'string') throw new Error(`translations.${language}.${key} must be text`)
      translation[known] = value
    }
    resolved[language.toLowerCase()] = translation
  }
  return resolved
}

export function resolveConfig(raw: EventideConfig): ResolvedConfig {
  if (!Array.isArray(raw?.calendars) || raw.calendars.length === 0) {
    throw new Error('calendars must list at least one calendar entity')
  }
  const view = raw.view ?? 'auto'
  if (!VIEWS.includes(view)) throw new Error(`view must be one of ${VIEWS.join(', ')}`)
  const firstWeekday = raw.first_weekday
  if (
    firstWeekday !== undefined &&
    firstWeekday !== 'language' &&
    !WEEKDAYS.includes(firstWeekday)
  ) {
    throw new Error(`first_weekday must be language or one of ${WEEKDAYS.join(', ')}`)
  }
  const timeFormat = raw.time_format === undefined ? undefined : String(raw.time_format)
  if (timeFormat !== undefined && !TIME_FORMATS.includes(timeFormat)) {
    throw new Error(`time_format must be one of ${TIME_FORMATS.join(', ')}`)
  }
  const todayColor = raw.today_color
  if (todayColor !== undefined && (typeof todayColor !== 'string' || todayColor === '')) {
    throw new Error('today_color must be a color')
  }
  return {
    calendars: raw.calendars.map(resolveCalendar),
    view,
    leadMs: count('lead_time', raw.lead_time, DEFAULT_LEAD_MS / MINUTE) * MINUTE,
    lingerMs: count('linger', raw.linger, DEFAULT_LINGER_MS / MINUTE) * MINUTE,
    limit: count('limit', raw.limit, DEFAULT_LIMIT),
    dedupe: raw.dedupe ?? true,
    ...(firstWeekday === undefined ? {} : { firstWeekday }),
    ...(timeFormat === undefined ? {} : { timeFormat }),
    ...(todayColor === undefined ? {} : { todayColor }),
    showClock: raw.show_clock ?? false,
    showNavigation: raw.show_navigation ?? true,
    seriesColors: raw.series_colors ?? false,
    translations: resolveTranslations(raw.translations),
    showCancelled: raw.show_cancelled ?? true,
    cancelledPattern: resolveCancelledPattern(raw.cancelled_match),
    rules: compileRules(raw.rules ?? []),
  }
}
