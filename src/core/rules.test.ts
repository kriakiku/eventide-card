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

describe('renaming', () => {
  const titleOf = (rules: Parameters<typeof compileRules>[0], summary: string) =>
    applyRules(compileRules(rules), summary).title

  test('exact matches the whole title only, with the same case', () => {
    const rules = [{ exact: 'Team sync', title: 'Sync' }]
    expect(titleOf(rules, 'Team sync')).toBe('Sync')
    expect(titleOf(rules, 'team sync')).toBeUndefined()
    expect(titleOf(rules, 'Team sync today')).toBeUndefined()
  })

  test('exact treats special characters literally', () => {
    const rules = [{ exact: 'Q3 (plan) [draft] a+b/c?', title: 'Plan' }]
    expect(titleOf(rules, 'Q3 (plan) [draft] a+b/c?')).toBe('Plan')
    expect(titleOf(rules, 'Q3 plan draft')).toBeUndefined()
  })

  test('a pattern replaces the whole title', () => {
    expect(titleOf([{ match: 'daily', title: 'Standup' }], 'Baccarat DAILY call')).toBe('Standup')
  })

  test('capture groups can be used in the new title', () => {
    const rules = [{ match: '^Project (\\w+) review$', title: '$1 review' }]
    expect(titleOf(rules, 'Project Apollo review')).toBe('Apollo review')
  })

  test('a missing group becomes empty', () => {
    expect(titleOf([{ match: 'a', title: 'x$3y' }], 'a')).toBe('xy')
  })

  test('the first rule with a title wins, and others still add their fields', () => {
    const compiled = compileRules([
      { match: 'a', icon: 'mdi:a' },
      { match: 'a', title: 'First' },
      { match: 'a', title: 'Second', color: 'red' },
    ])
    expect(applyRules(compiled, 'a')).toEqual({ icon: 'mdi:a', title: 'First', color: 'red' })
  })

  test('a rule with neither match nor exact is reported', () => {
    expect(compileRules([{ title: 'x' }]).errors).toHaveLength(1)
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
