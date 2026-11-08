import type { AgendaItem } from '../core/types.ts'

export interface LocaleLike {
  language: string
  time_format?: string
  first_weekday?: string
}

export const TRANSLATION_KEYS = [
  'today',
  'tomorrow',
  'all_day',
  'cancelled',
  'empty',
  'free_day',
  'starts_in',
  'time_left',
  'ended_ago',
  'just_ended',
  'minutes',
  'hours',
] as const

export type TranslationKey = (typeof TRANSLATION_KEYS)[number]
export type Translation = Partial<Record<TranslationKey, string>>
export type Translations = Record<string, Translation>
type LabelKey = 'all_day' | 'cancelled' | 'empty' | 'free_day'

const EN: Required<Translation> = {
  today: 'Today',
  tomorrow: 'Tomorrow',
  all_day: 'All day',
  cancelled: 'Cancelled',
  empty: 'Nothing coming up',
  free_day: 'Nothing on this day',
  starts_in: 'in {time}',
  time_left: '{time} left',
  ended_ago: 'ended {time} ago',
  just_ended: 'just ended',
  minutes: '{n} min',
  hours: '{n} h',
}

const UK: Translation = {
  all_day: 'Весь день',
  cancelled: 'Скасовано',
  empty: 'Найближчих подій немає',
  free_day: 'Цього дня вільно',
}

const BUILT_IN: Translations = { en: EN, uk: UK }
const MINUTE = 60_000

export function resolveTranslation(language: string, custom: Translations = {}): Translation {
  const tag = language.toLowerCase()
  const prefix = tag.split('-')[0] ?? tag
  return { ...BUILT_IN[prefix], ...BUILT_IN[tag], ...custom[prefix], ...custom[tag] }
}

export function labelOf(translation: Translation, key: LabelKey): string {
  return translation[key] ?? EN[key]
}

export function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replaceAll(/\{(\w+)\}/g, (match, name: string) => String(values[name] ?? match))
}

function capitalize(text: string, language: string): string {
  return text.charAt(0).toLocaleUpperCase(language) + text.slice(1)
}

function relativeDistance(minutes: number, sign: 1 | -1, language: string): string {
  const format = new Intl.RelativeTimeFormat(language, { style: 'short' })
  if (minutes < 60) return format.format(sign * minutes, 'minute')
  return format.format(sign * Math.round(minutes / 60), 'hour')
}

function unitText(
  value: number,
  unit: 'minute' | 'hour',
  language: string,
  translation: Translation,
): string {
  const template = unit === 'minute' ? translation.minutes : translation.hours
  if (template !== undefined) return interpolate(template, { n: value })
  return new Intl.NumberFormat(language, { style: 'unit', unit, unitDisplay: 'short' }).format(
    value,
  )
}

function durationText(minutes: number, language: string, translation: Translation): string {
  if (minutes < 60) return unitText(minutes, 'minute', language, translation)
  const hours = unitText(Math.floor(minutes / 60), 'hour', language, translation)
  const rest = minutes % 60
  return rest === 0 ? hours : `${hours} ${unitText(rest, 'minute', language, translation)}`
}

export function etaText(
  item: AgendaItem,
  language: string,
  translation: Translation = resolveTranslation(language),
): string {
  const time = (minutes: number) => durationText(minutes, language, translation)
  if (item.phase === 'running') {
    const left = time(Math.ceil(item.msUntilEnd / MINUTE))
    return translation.time_left === undefined
      ? left
      : interpolate(translation.time_left, { time: left })
  }
  if (item.phase === 'finished') {
    const minutes = Math.floor(item.msSinceEnd / MINUTE)
    if (minutes === 0 && translation.just_ended !== undefined) return translation.just_ended
    const ago = Math.max(1, minutes)
    return translation.ended_ago === undefined
      ? relativeDistance(ago, -1, language)
      : interpolate(translation.ended_ago, { time: time(ago) })
  }
  const until = Math.ceil(item.msUntilStart / MINUTE)
  return translation.starts_in === undefined
    ? relativeDistance(until, 1, language)
    : interpolate(translation.starts_in, { time: time(until) })
}

export function showsEta(item: AgendaItem, todayKey: string, lingerMs: number): boolean {
  if (item.fill === null) return false
  if (item.phase === 'finished') return item.msSinceEnd < lingerMs
  return item.phase !== 'later' || item.event.startDay === todayKey
}

function utcOfDay(dayKey: string): Date {
  return new Date(`${dayKey}T12:00:00Z`)
}

export function weekdayShort(dayKey: string, language: string): string {
  return new Intl.DateTimeFormat(language, { weekday: 'short', timeZone: 'UTC' }).format(
    utcOfDay(dayKey),
  )
}

export function dayOfMonth(dayKey: string): number {
  return Number(dayKey.slice(8))
}

export function monthTitle(dayKey: string, language: string): string {
  const title = new Intl.DateTimeFormat(language, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(utcOfDay(dayKey))
  return capitalize(title, language)
}

export function groupTitle(
  dayKey: string,
  todayKey: string,
  tomorrowKey: string,
  language: string,
  translation: Translation = resolveTranslation(language),
): string {
  const offset = [todayKey, tomorrowKey].indexOf(dayKey)
  if (offset !== -1) {
    const custom = offset === 0 ? translation.today : translation.tomorrow
    if (custom !== undefined) return custom
    const format = new Intl.RelativeTimeFormat(language, { numeric: 'auto' })
    return capitalize(format.format(offset, 'day'), language)
  }
  const title = new Intl.DateTimeFormat(language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(utcOfDay(dayKey))
  return capitalize(title, language)
}

function hourCycleOf(timeFormat: string | undefined): 'h12' | 'h23' | undefined {
  if (timeFormat === '12') return 'h12'
  if (timeFormat === '24') return 'h23'
  return undefined
}

export function clockFormatter(locale: LocaleLike, timeZone: string): Intl.DateTimeFormat {
  const hourCycle = hourCycleOf(locale.time_format)
  return new Intl.DateTimeFormat(locale.language, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
    ...(hourCycle === undefined ? {} : { hourCycle }),
  })
}

export function dayBackground(colors: readonly string[]): string {
  const stops = [...new Set(colors)].map((color) => `color-mix(in srgb, ${color} 30%, transparent)`)
  if (stops.length < 2) return stops[0] ?? ''
  return `linear-gradient(135deg, ${stops.join(', ')})`
}

const SERIES_SHIFTS = [-48, -32, -16, 0, 16, 32, 48]

export function seriesShift(seriesId: string): number {
  let hash = 0x811c9dc5
  for (const char of seriesId) {
    hash ^= char.codePointAt(0) ?? 0
    hash = Math.imul(hash, 0x01000193)
  }
  return SERIES_SHIFTS[(hash >>> 0) % SERIES_SHIFTS.length] ?? 0
}

export function seriesColor(base: string, seriesId: string): string {
  return `oklch(from ${base} l c calc(h + ${seriesShift(seriesId)}))`
}

export function fadeEdges(
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
): { top: boolean; bottom: boolean } {
  return { top: scrollTop > 1, bottom: scrollTop + clientHeight < scrollHeight - 1 }
}

const DOTS_IN_FIRST_ROW = 3
const MAX_DOTS = 5

export function dotsOf(calendarIds: readonly string[]): { rows: string[][]; more: number } {
  const shown = calendarIds.length <= MAX_DOTS ? calendarIds : calendarIds.slice(0, MAX_DOTS - 1)
  const rows = [shown.slice(0, DOTS_IN_FIRST_ROW), shown.slice(DOTS_IN_FIRST_ROW)].filter(
    (row) => row.length > 0,
  )
  return { rows, more: calendarIds.length - shown.length }
}

export const WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
]

interface WeekInfo {
  firstDay: number
}

export function resolveFirstWeekday(locale: LocaleLike): number {
  const configured = WEEKDAYS.indexOf(locale.first_weekday ?? 'language')
  if (configured !== -1) return configured
  try {
    const intl = new Intl.Locale(locale.language) as Intl.Locale & {
      getWeekInfo?: () => WeekInfo
      weekInfo?: WeekInfo
    }
    const firstDay = (intl.getWeekInfo?.() ?? intl.weekInfo)?.firstDay
    return firstDay === undefined ? 1 : firstDay % 7
  } catch {
    return 1
  }
}
