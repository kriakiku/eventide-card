import { describe, expect, test } from 'bun:test'

import { DEFAULT_LEAD_MS, isSpanning, phaseOf } from './phase.ts'

const MIN = 60_000
const START = 1_000 * MIN
const END = START + 30 * MIN
const LEAD = 60 * MIN
const timed = { startMs: START, endMs: END, allDay: false, startDay: 'd', endDay: 'd' }

describe('timed events', () => {
  test.each([
    ['long before', START - 120 * MIN, 'later', 0],
    ['one ms before the lead', START - LEAD - 1, 'later', 0],
    ['exactly at the lead', START - LEAD, 'soon', 0],
    ['halfway through the lead', START - 30 * MIN, 'soon', 0.5],
    ['a quarter left', START - 15 * MIN, 'soon', 0.75],
    ['exactly at start', START, 'running', 1],
    ['a third in', START + 10 * MIN, 'running', 2 / 3],
    ['halfway', START + 15 * MIN, 'running', 0.5],
    ['exactly at end', END, 'finished', 0],
    ['long after', END + 500 * MIN, 'finished', 0],
  ])('%s', (_name, now, phase, fill) => {
    const status = phaseOf(timed, now, LEAD)
    expect<string>(status.phase).toBe(phase)
    expect(status.fill).toBeCloseTo(fill, 10)
  })

  test('fill never leaves 0..1 and is monotonic across a whole event', () => {
    let previous = -1
    for (let now = START - LEAD; now < START; now += MIN) {
      const fill = phaseOf(timed, now, LEAD).fill ?? Number.NaN
      expect(fill).toBeGreaterThan(previous)
      expect(fill).toBeLessThan(1)
      previous = fill
    }
    previous = 2
    for (let now = START; now < END; now += MIN) {
      const fill = phaseOf(timed, now, LEAD).fill ?? Number.NaN
      expect(fill).toBeLessThan(previous)
      expect(fill).toBeGreaterThan(0)
      previous = fill
    }
  })

  test('exposes time remaining without going negative', () => {
    expect(phaseOf(timed, START - 22 * MIN, LEAD)).toMatchObject({
      msUntilStart: 22 * MIN,
      msUntilEnd: 52 * MIN,
    })
    expect(phaseOf(timed, END - 7 * MIN, LEAD)).toMatchObject({
      msUntilStart: 0,
      msUntilEnd: 7 * MIN,
    })
    expect(phaseOf(timed, END + MIN, LEAD)).toMatchObject({ msUntilStart: 0, msUntilEnd: 0 })
  })

  test('lead defaults to 60 minutes', () => {
    expect(DEFAULT_LEAD_MS).toBe(LEAD)
    expect(phaseOf(timed, START - LEAD).phase).toBe('soon')
    expect(phaseOf(timed, START - LEAD - 1).phase).toBe('later')
  })

  test.each([[0], [-5], [Number.NaN]])('lead %d disables the soon phase', (lead) => {
    expect(phaseOf(timed, START - 1, lead)).toMatchObject({ phase: 'later', fill: 0 })
    expect(phaseOf(timed, START, lead)).toMatchObject({ phase: 'running', fill: 1 })
  })
})

describe('zero-length events', () => {
  const instant = { ...timed, endMs: START }

  test.each([
    [START - LEAD - 1, 'later', 0],
    [START - 30 * MIN, 'soon', 0.5],
    [START, 'finished', 0],
    [START + 1, 'finished', 0],
  ])('at %d', (now, phase, fill) => {
    const status = phaseOf(instant, now, LEAD)
    expect<string>(status.phase).toBe(phase)
    expect(status.fill).toBe(fill)
  })
})

describe('all-day and multi-day events have no fill', () => {
  const allDay = { ...timed, allDay: true, endMs: START + 1440 * MIN }
  const multi = { ...timed, endMs: START + 3000 * MIN, startDay: 'a', endDay: 'c' }

  test.each([
    ['all-day', allDay],
    ['multi-day timed', multi],
  ])('%s', (_name, event) => {
    expect(phaseOf(event, START - 10 * MIN, LEAD)).toMatchObject({ phase: 'later', fill: null })
    expect(phaseOf(event, START, LEAD)).toMatchObject({ phase: 'running', fill: null })
    expect(phaseOf(event, event.endMs - 1, LEAD)).toMatchObject({ phase: 'running', fill: null })
    expect(phaseOf(event, event.endMs, LEAD)).toMatchObject({ phase: 'finished', fill: null })
  })

  test('isSpanning', () => {
    expect(isSpanning(timed)).toBe(false)
    expect(isSpanning(allDay)).toBe(true)
    expect(isSpanning(multi)).toBe(true)
    expect(isSpanning({ ...timed, endMs: START + 1439 * MIN })).toBe(false)
    expect(isSpanning({ ...timed, endMs: START + 1440 * MIN })).toBe(true)
  })
})
