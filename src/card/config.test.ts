import { describe, expect, test } from 'bun:test'

import { resolveConfig } from './config.ts'

const calendars = ['calendar.a']

describe('resolveConfig', () => {
  test('applies the defaults', () => {
    expect(resolveConfig({ calendars })).toMatchObject({
      view: 'auto',
      leadMs: 3_600_000,
      lingerMs: 1_800_000,
      limit: 5,
      dedupe: true,
    })
  })

  test('converts minutes and accepts zero', () => {
    expect(resolveConfig({ calendars, lead_time: 15, linger: 0, limit: 0 })).toMatchObject({
      leadMs: 900_000,
      lingerMs: 0,
      limit: 0,
    })
  })

  test('accepts strings and objects, and assigns distinct colors', () => {
    const { calendars: resolved } = resolveConfig({
      calendars: ['calendar.a', { entity: 'calendar.b' }, { entity: 'calendar.c', color: 'red' }],
    })
    expect(resolved.map(({ entity }) => entity)).toEqual(['calendar.a', 'calendar.b', 'calendar.c'])
    expect(resolved[0]?.color).not.toBe(resolved[1]?.color)
    expect(resolved[2]?.color).toBe('red')
  })

  test.each([
    ['no calendars', { calendars: [] }],
    ['a non-calendar entity', { calendars: ['sensor.a'] }],
    ['a bad view', { calendars, view: 'year' }],
    ['a text linger', { calendars, linger: 'abc' }],
    ['a NaN lead time', { calendars, lead_time: Number.NaN }],
    ['an infinite linger', { calendars, linger: Number.POSITIVE_INFINITY }],
    ['a negative limit', { calendars, limit: -1 }],
  ])('rejects %s', (_name, config) => {
    expect(() => resolveConfig(config as never)).toThrow()
  })

  test('reports an invalid rule without failing', () => {
    const { rules } = resolveConfig({ calendars, rules: [{ match: '[bad', icon: 'mdi:x' }] })
    expect(rules.errors).toHaveLength(1)
  })
})
