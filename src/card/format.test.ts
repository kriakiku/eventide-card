import { describe, expect, test } from 'bun:test'

import type { AgendaItem } from '../core/types.ts'
import {
  clockFormatter,
  dayBackground,
  dotsOf,
  etaLines,
  fadeEdges,
  groupTitle,
  monthTitle,
  resolveFirstWeekday,
  showsEta,
  stringsFor,
} from './format.ts'

const MIN = 60_000

function item(overrides: Partial<AgendaItem>, startDay = '2026-11-09'): AgendaItem {
  return {
    phase: 'later',
    fill: 0,
    msUntilStart: 0,
    msUntilEnd: 0,
    msSinceEnd: 0,
    event: { startDay } as AgendaItem['event'],
    ...overrides,
  }
}

describe('etaLines', () => {
  const uk = stringsFor('uk')

  test.each([
    ['rounds a start up', { phase: 'soon', msUntilStart: 21.5 * MIN }, ['за', '22 хв']],
    ['never says zero', { phase: 'soon', msUntilStart: 1000 }, ['за', '1 хв']],
    ['hours and minutes', { phase: 'later', msUntilStart: 232 * MIN }, ['за', '3 год 52 хв']],
    ['whole hours', { phase: 'later', msUntilStart: 120 * MIN }, ['за', '2 год']],
    ['running', { phase: 'running', msUntilEnd: 6.2 * MIN }, ['залишилось', '7 хв']],
    ['finished', { phase: 'finished', msSinceEnd: 12.9 * MIN }, ['закінчилось', '12 хв тому']],
    ['just finished', { phase: 'finished', msSinceEnd: 20_000 }, ['щойно']],
  ] as const)('%s', (_name, overrides, lines) => {
    expect(etaLines(item(overrides), uk)).toEqual([...lines])
  })

  test('falls back to English and handles regional tags', () => {
    expect(etaLines(item({ phase: 'soon', msUntilStart: 5 * MIN }), stringsFor('de'))).toEqual([
      'in 5 min',
    ])
    expect(stringsFor('uk-UA').today).toBe('Сьогодні')
    expect(stringsFor('ru').today).toBe('Today')
    expect(stringsFor('uk').today).toBe('Сьогодні')
  })
})

describe('showsEta', () => {
  const today = '2026-11-09'

  test.each([
    ['later today', item({ phase: 'later' }), true],
    ['later on another day', item({ phase: 'later' }, '2026-11-12'), false],
    ['soon', item({ phase: 'soon' }), true],
    ['running', item({ phase: 'running' }), true],
    ['lingering', item({ phase: 'finished', msSinceEnd: 10 * MIN }), true],
    ['long finished on a picked day', item({ phase: 'finished', msSinceEnd: 90 * MIN }), false],
    ['all-day', item({ phase: 'running', fill: null }), false],
  ])('%s', (_name, value, expected) => {
    expect(showsEta(value, today, 30 * MIN)).toBe(expected)
  })
})

describe('titles and clocks', () => {
  test('capitalizes month titles', () => {
    expect(monthTitle('2026-11-09', 'uk')).toStartWith('Листопад')
    expect(monthTitle('2026-11-09', 'en')).toBe('November 2026')
  })

  test('names today and tomorrow, and spells out other days', () => {
    const title = (day: string) => groupTitle(day, '2026-11-09', '2026-11-10', 'en')
    expect(title('2026-11-09')).toBe('Today')
    expect(title('2026-11-10')).toBe('Tomorrow')
    expect(title('2026-11-12')).toContain('Thursday')
  })

  test('formats the clock in the given zone and format', () => {
    const at = Date.UTC(2026, 10, 9, 13, 5)
    expect(clockFormatter({ language: 'en', time_format: '24' }, 'Europe/Kyiv').format(at)).toBe(
      '15:05',
    )
    expect(clockFormatter({ language: 'en', time_format: '12' }, 'UTC').format(at)).toMatch(
      /01:05\sPM/,
    )
  })
})

describe('hour cycles and dots', () => {
  test('24-hour format says 00 at midnight, even in English', () => {
    const midnight = Date.UTC(2026, 10, 9, 0, 5)
    expect(clockFormatter({ language: 'en', time_format: '24' }, 'UTC').format(midnight)).toBe(
      '00:05',
    )
  })

  test.each([
    [0, [], 0],
    [1, [1], 0],
    [3, [3], 0],
    [4, [3, 1], 0],
    [6, [3, 3], 0],
    [7, [3, 2], 2],
    [12, [3, 2], 7],
  ])('%i events make rows %j and %i more', (count, rows, more) => {
    const result = dotsOf(Array.from({ length: count }, () => 'a'))
    expect(result.rows.map((row) => row.length)).toEqual(rows)
    expect(result.more).toBe(more)
  })

  test('keeps the calendar order across rows', () => {
    expect(dotsOf(['a', 'a', 'a', 'b']).rows).toEqual([['a', 'a', 'a'], ['b']])
  })
})

describe('fadeEdges', () => {
  test.each([
    ['content fits', 0, 500, 500, false, false],
    ['at the top of a long list', 0, 500, 900, false, true],
    ['in the middle', 200, 500, 900, true, true],
    ['at the very end', 400, 500, 900, true, false],
    ['within a pixel of the end', 399.5, 500, 900, true, false],
  ])('%s', (_name, scrollTop, clientHeight, scrollHeight, top, bottom) => {
    expect(fadeEdges(scrollTop, clientHeight, scrollHeight)).toEqual({ top, bottom })
  })
})

describe('dayBackground', () => {
  test('is empty with no colors', () => {
    expect(dayBackground([])).toBe('')
  })

  test('is a flat tint for one color, or for the same color twice', () => {
    expect(dayBackground(['red'])).toBe('color-mix(in srgb, red 30%, transparent)')
    expect(dayBackground(['red', 'red'])).toBe('color-mix(in srgb, red 30%, transparent)')
  })

  test('blends several calendars in order', () => {
    expect(dayBackground(['red', 'blue'])).toBe(
      'linear-gradient(135deg, color-mix(in srgb, red 30%, transparent), color-mix(in srgb, blue 30%, transparent))',
    )
  })
})

describe('resolveFirstWeekday', () => {
  test.each([
    [{ language: 'en', first_weekday: 'sunday' }, 0],
    [{ language: 'en', first_weekday: 'monday' }, 1],
    [{ language: 'en', first_weekday: 'saturday' }, 6],
    [{ language: 'ru', first_weekday: 'language' }, 1],
    [{ language: 'en-US', first_weekday: 'language' }, 0],
    [{ language: 'uk' }, 1],
  ])('%j', (locale, expected) => {
    expect(resolveFirstWeekday(locale)).toBe(expected)
  })
})
