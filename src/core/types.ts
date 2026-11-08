export type Phase = 'later' | 'soon' | 'running' | 'finished'

export interface RawEventFields {
  summary: string
  description?: string | null
  location?: string | null
  uid?: string | null
  recurrence_id?: string | null
  rrule?: string | null
  status?: string | null
}

export type RawRestDate = { dateTime: string } | { date: string }

export interface RawRestEvent extends RawEventFields {
  start: RawRestDate
  end: RawRestDate
}

export interface RawSubscribeEvent extends RawEventFields {
  start: string
  end: string
  all_day: boolean
}

export type RawCalendarEvent = RawRestEvent | RawSubscribeEvent

export interface NormalizeContext {
  calendarId: string
  timeZone: string
}

export interface NormalizedEvent {
  key: string
  calendarId: string
  summary: string
  description: string | null
  location: string | null
  startMs: number
  endMs: number
  allDay: boolean
  startDay: string
  endDay: string
}

export interface EventStatus {
  phase: Phase
  fill: number | null
  msUntilStart: number
  msUntilEnd: number
  msSinceEnd: number
}

export interface AgendaOptions {
  nowMs: number
  timeZone: string
  leadMs?: number
  lingerMs?: number
  limit?: number
  day?: string
  dedupe?: boolean
}

export interface AgendaItem extends EventStatus {
  event: NormalizedEvent
}

export interface AgendaGroup {
  dayKey: string
  allDay: AgendaItem[]
  timed: AgendaItem[]
}

export type GridEvent = Pick<NormalizedEvent, 'calendarId' | 'startDay' | 'endDay'>

export interface MonthGridOptions {
  year: number
  month: number
  firstWeekday: number
  todayKey: string
  events: readonly GridEvent[]
}

export interface WeekGridOptions {
  anchorKey: string
  firstWeekday: number
  todayKey: string
  events: readonly GridEvent[]
}

export interface GridCell {
  dayKey: string
  inMonth: boolean
  isToday: boolean
  calendarIds: string[]
  eventCalendarIds: string[]
}

export interface Rule {
  match: string
  icon?: string
  color?: string
  calendar?: string
}

export interface CompiledRule extends Omit<Rule, 'match'> {
  pattern: RegExp
}

export interface RuleError {
  index: number
  match: string
  message: string
}

export interface CompiledRules {
  rules: CompiledRule[]
  errors: RuleError[]
}

export type RuleResult = Pick<Rule, 'icon' | 'color' | 'calendar'>
