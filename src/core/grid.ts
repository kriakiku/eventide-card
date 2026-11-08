import { addDays, utcMs, weekdayOf } from './timezone.ts'
import type { GridCell, GridEvent, MonthGridOptions, WeekGridOptions } from './types.ts'

const DAYS_IN_WEEK = 7
const DAY_MS = 86_400_000

function leadingDays(dayKey: string, firstWeekday: number): number {
  const offset = weekdayOf(dayKey) - Math.trunc(firstWeekday)
  return ((offset % DAYS_IN_WEEK) + DAYS_IN_WEEK) % DAYS_IN_WEEK
}

function monthOf(dayKey: string): string {
  return dayKey.slice(0, 7)
}

function buildCells(
  startKey: string,
  count: number,
  month: string,
  todayKey: string,
  events: readonly GridEvent[],
): GridCell[] {
  const calendars = [...new Set(events.map((event) => event.calendarId))]
  return Array.from({ length: count }, (_, index) => {
    const dayKey = addDays(startKey, index)
    const touching = events.filter(({ startDay, endDay }) => startDay <= dayKey && dayKey <= endDay)
    return {
      dayKey,
      inMonth: monthOf(dayKey) === month,
      isToday: dayKey === todayKey,
      calendarIds: calendars.filter((id) => touching.some((event) => event.calendarId === id)),
      eventCalendarIds: calendars.flatMap((id) =>
        touching.filter((event) => event.calendarId === id).map(() => id),
      ),
    }
  })
}

export function buildMonthGrid(options: MonthGridOptions): GridCell[] {
  const { year, month, firstWeekday, todayKey, events } = options
  const firstMs = utcMs(year, month, 1)
  const firstKey = new Date(firstMs).toISOString().slice(0, 10)
  const firstMonth = monthOf(firstKey)
  const daysInMonth = Math.round((utcMs(year, month + 1, 1) - firstMs) / DAY_MS)

  const lead = leadingDays(firstKey, firstWeekday)
  const count = Math.ceil((lead + daysInMonth) / DAYS_IN_WEEK) * DAYS_IN_WEEK
  return buildCells(addDays(firstKey, -lead), count, firstMonth, todayKey, events)
}

export function buildWeekGrid(options: WeekGridOptions): GridCell[] {
  const { anchorKey, firstWeekday, todayKey, events } = options
  const lead = leadingDays(anchorKey, firstWeekday)
  return buildCells(addDays(anchorKey, -lead), DAYS_IN_WEEK, monthOf(anchorKey), todayKey, events)
}
