import { describe, expect, test } from 'bun:test'

import type { AgendaItem } from '../core/types.ts'
import {
  clockFormatter,
  etaLines,
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
  const ru = stringsFor('ru')

  test.each([
    ['rounds a start up', { phase: 'soon', msUntilStart: 21.5 * MIN }, ['через', '22 мин']],
    ['never says zero', { phase: 'soon', msUntilStart: 1000 }, ['через', '1 мин']],
    ['hours and minutes', { phase: 'later', msUntilStart: 232 * MIN }, ['через', '3 ч 52 мин']],
    ['whole hours', { phase: 'later', msUntilStart: 120 * MIN }, ['через', '2 ч']],
    ['running', { phase: 'running', msUntilEnd: 6.2 * MIN }, ['осталось', '7 мин']],
    ['finished', { phase: 'finished', msSinceEnd: 12.9 * MIN }, ['закончилось', '12 мин назад']],
    ['just finished', { phase: 'finished', msSinceEnd: 20_000 }, ['только что']],
  ] as const)('%s', (_name, overrides, lines) => {
    expect(etaLines(item(overrides), ru)).toEqual([...lines])
  })

  test('falls back to English and handles regional tags', () => {
    expect(etaLines(item({ phase: 'soon', msUntilStart: 5 * MIN }), stringsFor('de'))).toEqual([
      'in 5 min',
    ])
    expect(stringsFor('ru-UA').today).toBe('Сегодня')
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
    expect(monthTitle('2026-11-09', 'ru')).toStartWith('Ноябрь')
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
