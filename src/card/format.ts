import type { AgendaItem } from '../core/types.ts'

export interface LocaleLike {
  language: string
  time_format?: string
  first_weekday?: string
}

interface Strings {
  today: string
  tomorrow: string
  allDay: string
  empty: string
  freeDay: string
  justEnded: string
  minutes: string
  hours: string
  until: (span: string) => string[]
  left: (span: string) => string[]
  ended: (span: string) => string[]
}

const EN: Strings = {
  today: 'Today',
  tomorrow: 'Tomorrow',
  allDay: 'All day',
  empty: 'Nothing coming up',
  freeDay: 'Nothing on this day',
  justEnded: 'just ended',
  minutes: 'min',
  hours: 'h',
  until: (span) => [`in ${span}`],
  left: (span) => [`${span} left`],
  ended: (span) => ['ended', `${span} ago`],
}

const UK: Strings = {
  today: 'Сьогодні',
  tomorrow: 'Завтра',
  allDay: 'Весь день',
  empty: 'Найближчих подій немає',
  freeDay: 'Цього дня вільно',
  justEnded: 'щойно',
  minutes: 'хв',
  hours: 'год',
  until: (span) => ['за', span],
  left: (span) => ['залишилось', span],
  ended: (span) => ['закінчилось', `${span} тому`],
}

const MINUTE = 60_000

export function stringsFor(language: string): Strings {
  const prefix = language.toLowerCase().split('-')[0]
  if (prefix === 'uk') return UK
  return EN
}

function formatSpan(minutes: number, strings: Strings): string {
  if (minutes < 60) return `${minutes} ${strings.minutes}`
  const rest = minutes % 60
  const hours = `${Math.floor(minutes / 60)} ${strings.hours}`
  return rest === 0 ? hours : `${hours} ${rest} ${strings.minutes}`
}

export function etaLines(item: AgendaItem, strings: Strings): string[] {
  if (item.phase === 'running')
    return strings.left(formatSpan(Math.ceil(item.msUntilEnd / MINUTE), strings))
  if (item.phase === 'finished') {
    const minutes = Math.floor(item.msSinceEnd / MINUTE)
    return minutes === 0 ? [strings.justEnded] : strings.ended(formatSpan(minutes, strings))
  }
  return strings.until(formatSpan(Math.ceil(item.msUntilStart / MINUTE), strings))
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
  return title.charAt(0).toLocaleUpperCase(language) + title.slice(1)
}

export function groupTitle(
  dayKey: string,
  todayKey: string,
  tomorrowKey: string,
  language: string,
): string {
  const strings = stringsFor(language)
  if (dayKey === todayKey) return strings.today
  if (dayKey === tomorrowKey) return strings.tomorrow
  const title = new Intl.DateTimeFormat(language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(utcOfDay(dayKey))
  return title.charAt(0).toLocaleUpperCase(language) + title.slice(1)
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

export function fadeEdges(
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
): { top: boolean; bottom: boolean } {
  return { top: scrollTop > 1, bottom: scrollTop + clientHeight < scrollHeight - 1 }
}

const DOTS_PER_ROW = 3
const MAX_DOTS = DOTS_PER_ROW * 2

export function dotsOf(calendarIds: readonly string[]): { rows: string[][]; more: number } {
  const fits = calendarIds.length <= MAX_DOTS
  const shown = calendarIds.slice(0, fits ? MAX_DOTS : MAX_DOTS - 1)
  const rows = [shown.slice(0, DOTS_PER_ROW), shown.slice(DOTS_PER_ROW)].filter(
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
