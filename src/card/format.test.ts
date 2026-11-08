import { describe, expect, test } from 'bun:test'

import type { AgendaItem } from '../core/types.ts'
import {
  clockFormatter,
  dayBackground,
  dotsOf,
  etaText,
  interpolate,
  labelOf,
  resolveTranslation,
  fadeEdges,
  groupTitle,
  monthTitle,
  resolveFirstWeekday,
  seriesColor,
  seriesShift,
  showsEta,
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

describe('etaText', () => {
  test.each([
    ['rounds a start up', { phase: 'soon', msUntilStart: 21.5 * MIN }, 'через 22 хв'],
    ['never says zero', { phase: 'soon', msUntilStart: 1000 }, 'через 1 хв'],
    ['rounds far starts to hours', { phase: 'later', msUntilStart: 232 * MIN }, 'через 4 год'],
    ['turns 60 minutes into an hour', { phase: 'soon', msUntilStart: 59.5 * MIN }, 'через 1 год'],
    ['running in minutes', { phase: 'running', msUntilEnd: 6.2 * MIN }, '7 хв'],
    ['running in hours and minutes', { phase: 'running', msUntilEnd: 90 * MIN }, '1 год 30 хв'],
    ['running in whole hours', { phase: 'running', msUntilEnd: 120 * MIN }, '2 год'],
    ['finished', { phase: 'finished', msSinceEnd: 12.9 * MIN }, '12 хв тому'],
    ['just finished', { phase: 'finished', msSinceEnd: 20_000 }, '1 хв тому'],
  ] as const)('%s', (_name, overrides, text) => {
    expect(etaText(item(overrides), 'uk')).toBe(text)
  })

  test('follows the language without a dictionary', () => {
    expect(etaText(item({ phase: 'soon', msUntilStart: 5 * MIN }), 'de')).toBe('in 5 Min.')
  })
})

describe('English defaults', () => {
  test.each([
    ['hours and minutes ahead', { phase: 'later', msUntilStart: 232 * MIN }, 'in 3 h 52 min'],
    ['minutes ahead', { phase: 'soon', msUntilStart: 21.5 * MIN }, 'in 22 min'],
    ['running', { phase: 'running', msUntilEnd: 6.2 * MIN }, '7 min left'],
    ['running long', { phase: 'running', msUntilEnd: 90 * MIN }, '1 h 30 min left'],
    ['finished', { phase: 'finished', msSinceEnd: 23.5 * MIN }, 'ended 23 min ago'],
    ['just finished', { phase: 'finished', msSinceEnd: 20_000 }, 'just ended'],
  ] as const)('%s', (_name, overrides, text) => {
    expect(etaText(item(overrides), 'en')).toBe(text)
    expect(etaText(item(overrides), 'en-GB')).toBe(text)
  })
})

describe('custom translations', () => {
  const lt = resolveTranslation('lt', {
    lt: {
      today: 'Šiandien',
      all_day: 'Visą dieną',
      starts_in: 'po {time}',
      time_left: 'liko {time}',
      ended_ago: 'baigėsi prieš {time}',
      minutes: '{n} min.',
      hours: '{n} val.',
    },
  })

  test.each([
    [{ phase: 'later', msUntilStart: 232 * MIN }, 'po 3 val. 52 min.'],
    [{ phase: 'running', msUntilEnd: 7 * MIN }, 'liko 7 min.'],
    [{ phase: 'finished', msSinceEnd: 23 * MIN }, 'baigėsi prieš 23 min.'],
  ] as const)('%j', (overrides, text) => {
    expect(etaText(item(overrides), 'lt', lt)).toBe(text)
  })

  test('a partial translation keeps the browser for the rest', () => {
    const partial = resolveTranslation('uk', { uk: { time_left: 'ще {time}' } })
    expect(etaText(item({ phase: 'running', msUntilEnd: 7 * MIN }), 'uk', partial)).toBe('ще 7 хв')
    expect(etaText(item({ phase: 'soon', msUntilStart: 5 * MIN }), 'uk', partial)).toBe(
      'через 5 хв',
    )
  })

  test('a regional override beats the language, and English can be changed', () => {
    const custom = { pt: { today: 'Hoje' }, 'pt-br': { today: 'Hoje!' } }
    expect(resolveTranslation('pt', custom).today).toBe('Hoje')
    expect(resolveTranslation('pt-BR', custom).today).toBe('Hoje!')
    expect(resolveTranslation('en', { en: { minutes: '{n}m' } }).minutes).toBe('{n}m')
    expect(resolveTranslation('en', { en: { minutes: '{n}m' } }).hours).toBe('{n} h')
  })

  test('groups use a custom today and the browser otherwise', () => {
    expect(groupTitle('2026-11-09', '2026-11-09', '2026-11-10', 'lt', lt)).toBe('Šiandien')
    expect(groupTitle('2026-11-10', '2026-11-09', '2026-11-10', 'lt', lt)).toBe('Rytoj')
  })

  test('labels fall back to English', () => {
    expect(labelOf(lt, 'all_day')).toBe('Visą dieną')
    expect(labelOf(lt, 'empty')).toBe('Nothing coming up')
    expect(labelOf(resolveTranslation('uk-UA'), 'all_day')).toBe('Весь день')
  })

  test('interpolation leaves unknown placeholders alone', () => {
    expect(interpolate('{a} and {b}', { a: 1 })).toBe('1 and {b}')
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
    expect(groupTitle('2026-11-09', '2026-11-09', '2026-11-10', 'uk')).toBe('Сьогодні')
    expect(groupTitle('2026-11-10', '2026-11-09', '2026-11-10', 'de')).toBe('Morgen')
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
    [5, [3, 2], 0],
    [6, [3, 1], 2],
    [8, [3, 1], 4],
    [12, [3, 1], 8],
  ])('%i events make rows %j and %i more', (count, rows, more) => {
    const result = dotsOf(Array.from({ length: count }, () => 'a'))
    expect(result.rows.map((row) => row.length)).toEqual(rows)
    expect(result.more).toBe(more)
  })

  test('keeps the calendar order across rows', () => {
    expect(dotsOf(['a', 'a', 'a', 'b']).rows).toEqual([['a', 'a', 'a'], ['b']])
  })
})

describe('series colors', () => {
  test('are stable and stay within a harmonious hue range', () => {
    for (const id of ['a', 'Team daily', 'uid-123@outlook', 'Українська']) {
      expect(seriesShift(id)).toBe(seriesShift(id))
      expect(Math.abs(seriesShift(id))).toBeLessThanOrEqual(48)
    }
  })

  test('spread across different events', () => {
    const shifts = new Set(Array.from({ length: 100 }, (_, index) => seriesShift(`event-${index}`)))
    expect(shifts.size).toBe(7)
  })

  test('are derived from the calendar color', () => {
    expect(seriesColor('#7F77DD', 'a')).toBe(
      `oklch(from #7F77DD l c calc(h + ${seriesShift('a')}))`,
    )
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
