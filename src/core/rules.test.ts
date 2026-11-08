import { describe, expect, test } from 'bun:test'

import { applyRules, compileRules } from './rules.ts'

describe('compileRules', () => {
  test('compiles valid rules and keeps their fields', () => {
    const compiled = compileRules([{ match: 'gym', icon: 'mdi:dumbbell', color: 'red' }])
    expect(compiled.errors).toEqual([])
    expect(compiled.rules).toHaveLength(1)
    expect(compiled.rules[0]).toMatchObject({ icon: 'mdi:dumbbell', color: 'red' })
  })

  test('skips and reports invalid regexes without throwing', () => {
    const compiled = compileRules([
      { match: '(', icon: 'a' },
      { match: 'ok', icon: 'b' },
      { match: '[', icon: 'c' },
    ])
    expect(compiled.rules).toHaveLength(1)
    expect(compiled.errors.map((error) => [error.index, error.match])).toEqual([
      [0, '('],
      [2, '['],
    ])
    expect(compiled.errors[0]?.message).toEqual(expect.any(String))
    expect(applyRules(compiled, 'ok')).toEqual({ icon: 'b' })
  })

  test('reports a pattern only unicode mode rejects', () => {
    expect(compileRules([{ match: '\\-' }]).errors).toHaveLength(1)
  })

  test.each(['{"match":5}', '{}', 'null'])('reports a non-string match in %s', (json) => {
    const compiled = compileRules([JSON.parse(json)])
    expect(compiled.rules).toEqual([])
    expect(compiled.errors[0]?.index).toBe(0)
  })
})

describe('applyRules', () => {
  test.each([
    ['українська', 'Українська', true],
    ['УКРАЇНСЬКА', 'українська мова', true],
    ['ґанок', 'Ґанок', true],
    ['тренування', 'Силове ТРЕНУВАННЯ', true],
    ['gym', 'GYM day', true],
    ['^gym$', 'gym day', false],
    ['\\p{Script=Cyrillic}+', 'Звіт', true],
    ['\\p{Script=Cyrillic}+', 'Report', false],
    ['📅', 'Plan 📅', true],
    ['^.$', '📅', true],
    ['робота', 'Report', false],
  ])('%s against %s', (match, summary, matched) => {
    const result = applyRules(compileRules([{ match, icon: 'x' }]), summary)
    expect(result).toEqual(matched ? { icon: 'x' } : {})
  })

  test('first match wins per field', () => {
    const compiled = compileRules([
      { match: 'gym', icon: 'first' },
      { match: 'gym', icon: 'second', color: 'red' },
      { match: 'gym', icon: 'third', color: 'blue', calendar: 'calendar.sport' },
    ])
    expect(applyRules(compiled, 'gym')).toEqual({
      icon: 'first',
      color: 'red',
      calendar: 'calendar.sport',
    })
  })

  test('non-matching rules contribute nothing', () => {
    const compiled = compileRules([
      { match: 'nope', icon: 'a' },
      { match: 'gym', color: 'b' },
    ])
    expect(applyRules(compiled, 'gym')).toEqual({ color: 'b' })
  })

  test('an empty value does not claim a field', () => {
    const compiled = compileRules([
      { match: 'gym', icon: '' },
      { match: 'gym', icon: 'real' },
    ])
    expect(applyRules(compiled, 'gym')).toEqual({ icon: 'real' })
  })

  test('matching is repeatable', () => {
    const compiled = compileRules([{ match: 'gym', icon: 'a' }])
    expect(applyRules(compiled, 'gym')).toEqual(applyRules(compiled, 'gym'))
  })

  test('no rules give an empty result', () => {
    expect(applyRules(compileRules([]), 'gym')).toEqual({})
  })
})
