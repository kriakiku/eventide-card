import { describe, expect, test } from 'bun:test'

import { buildMonthGrid, buildWeekGrid } from './grid.ts'
import type { GridEvent } from './types.ts'

const month = (year: number, m: number, firstWeekday: number, events: GridEvent[] = []) =>
  buildMonthGrid({ year, month: m, firstWeekday, todayKey: '2026-11-08', events })

const week = (anchorKey: string, firstWeekday: number, events: GridEvent[] = []) =>
  buildWeekGrid({ anchorKey, firstWeekday, todayKey: '2026-11-08', events })

const ev = (calendarId: string, startDay: string, endDay = startDay): GridEvent => ({
  calendarId,
  startDay,
  endDay,
})

describe('buildMonthGrid', () => {
  test.each([
    [2026, 2, 0, 4, '2026-02-01', '2026-02-28'],
    [2027, 2, 1, 4, '2027-02-01', '2027-02-28'],
    [2026, 8, 0, 6, '2026-07-26', '2026-09-05'],
    [2026, 8, 1, 6, '2026-07-27', '2026-09-06'],
    [2026, 11, 0, 5, '2026-11-01', '2026-12-05'],
    [2026, 11, 1, 6, '2026-10-26', '2026-12-06'],
    [2026, 11, 6, 5, '2026-10-31', '2026-12-04'],
    [2024, 2, 1, 5, '2024-01-29', '2024-03-03'],
  ])('%d-%d firstWeekday %d has %d rows', (y, m, first, rows, firstKey, lastKey) => {
    const cells = month(y, m, first)
    expect(cells).toHaveLength(rows * 7)
    expect(cells[0]?.dayKey).toBe(firstKey)
    expect(cells.at(-1)?.dayKey).toBe(lastKey)
    expect(new Date(`${firstKey}T00:00:00Z`).getUTCDay()).toBe(first)
  })

  test('cells are consecutive days and inMonth covers exactly the month', () => {
    const cells = month(2024, 2, 1)
    expect(cells.filter((cell) => cell.inMonth)).toHaveLength(29)
    expect(cells.find((cell) => cell.inMonth)?.dayKey).toBe('2024-02-01')
    expect(cells.findLast((cell) => cell.inMonth)?.dayKey).toBe('2024-02-29')
    for (let i = 1; i < cells.length; i += 1) {
      const delta =
        Date.parse(`${cells[i]?.dayKey}T00:00:00Z`) -
        Date.parse(`${cells[i - 1]?.dayKey}T00:00:00Z`)
      expect(delta).toBe(86_400_000)
    }
  })

  test('marks today only', () => {
    const today = month(2026, 11, 1).filter((cell) => cell.isToday)
    expect(today.map((cell) => cell.dayKey)).toEqual(['2026-11-08'])
    expect(month(2026, 1, 1).some((cell) => cell.isToday)).toBe(false)
  })

  test('calendarIds follow input calendar order and are unique', () => {
    const cells = month(2026, 11, 1, [
      ev('b', '2026-11-20'),
      ev('a', '2026-11-10'),
      ev('a', '2026-11-20'),
      ev('b', '2026-11-20'),
      ev('c', '2026-11-20'),
    ])
    const at = (key: string) => cells.find((cell) => cell.dayKey === key)?.calendarIds
    expect(at('2026-11-20')).toEqual(['b', 'a', 'c'])
    expect(at('2026-11-10')).toEqual(['a'])
    expect(at('2026-11-11')).toEqual([])
  })

  test('multi-day events mark every day they touch, clipped to the grid', () => {
    const cells = month(2026, 2, 0, [ev('a', '2026-01-30', '2026-02-03')])
    expect(cells.filter((cell) => cell.calendarIds.includes('a')).map((c) => c.dayKey)).toEqual([
      '2026-02-01',
      '2026-02-02',
      '2026-02-03',
    ])
  })

  test('leading and trailing days also carry events', () => {
    const cells = month(2026, 11, 1, [ev('a', '2026-10-27'), ev('b', '2026-12-05')])
    expect(cells.find((cell) => cell.dayKey === '2026-10-27')).toMatchObject({
      inMonth: false,
      calendarIds: ['a'],
    })
    expect(cells.find((cell) => cell.dayKey === '2026-12-05')).toMatchObject({
      inMonth: false,
      calendarIds: ['b'],
    })
  })
})

describe('buildWeekGrid', () => {
  test.each([
    ['2026-11-08', 0, '2026-11-08', '2026-11-14'],
    ['2026-11-08', 1, '2026-11-02', '2026-11-08'],
    ['2026-11-08', 6, '2026-11-07', '2026-11-13'],
    ['2026-11-07', 6, '2026-11-07', '2026-11-13'],
    ['2026-11-09', 1, '2026-11-09', '2026-11-15'],
    ['2026-01-01', 1, '2025-12-29', '2026-01-04'],
  ])('%s firstWeekday %d', (anchor, first, startKey, endKey) => {
    const cells = week(anchor, first)
    expect(cells).toHaveLength(7)
    expect(cells[0]?.dayKey).toBe(startKey)
    expect(cells.at(-1)?.dayKey).toBe(endKey)
    expect(cells.map((cell) => cell.dayKey)).toContain(anchor)
  })

  test('inMonth is relative to the anchor month across a boundary', () => {
    const cells = week('2026-01-01', 1)
    expect(cells.map((cell) => cell.inMonth)).toEqual([false, false, false, true, true, true, true])
  })

  test('marks today and event days', () => {
    const cells = week('2026-11-08', 1, [ev('a', '2026-11-07', '2026-11-09')])
    expect(cells.find((cell) => cell.isToday)?.dayKey).toBe('2026-11-08')
    expect(cells.filter((cell) => cell.calendarIds.length > 0).map((c) => c.dayKey)).toEqual([
      '2026-11-07',
      '2026-11-08',
    ])
  })
})
