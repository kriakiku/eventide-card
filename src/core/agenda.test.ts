import { describe, expect, test } from 'bun:test'

import { buildAgenda } from './agenda.ts'
import { normalizeEvent } from './normalize.ts'
import type { AgendaGroup, NormalizedEvent } from './types.ts'

const NOW = Date.UTC(2026, 10, 8, 12)
const base = { nowMs: NOW, timeZone: 'UTC' }

function make(
  summary: string,
  start: string,
  end: string,
  calendarId = 'a',
  timeZone = 'UTC',
): NormalizedEvent {
  const isDate = start.length === 10
  const event = normalizeEvent(
    {
      summary,
      start: isDate ? start : `${start}:00+00:00`,
      end: isDate ? end : `${end}:00+00:00`,
    },
    { calendarId, timeZone },
  )
  if (!event) throw new Error(`bad fixture ${summary}`)
  return event
}

const today = (hhmm: string) => `2026-11-08T${hhmm}`
const tomorrow = (hhmm: string) => `2026-11-09T${hhmm}`

function shape(groups: AgendaGroup[]) {
  return groups.map((group) => [
    group.dayKey,
    group.allDay.map((item) => item.event.summary),
    group.timed.map((item) => item.event.summary),
  ])
}

describe('filtering and ordering', () => {
  test('drops finished events and keeps the running one when linger is off', () => {
    const groups = buildAgenda(
      [
        make('done', today('09:00'), today('10:00')),
        make('edge', today('11:00'), today('12:00')),
        make('now', today('11:30'), today('12:30')),
      ],
      { ...base, lingerMs: 0 },
    )
    expect(shape(groups)).toEqual([['2026-11-08', [], ['now']]])
    expect(groups[0]?.timed[0]).toMatchObject({ phase: 'running', msUntilEnd: 1_800_000 })
  })

  test('drops a zero-length event once its time has come when linger is off', () => {
    const blip = make('blip', today('12:00'), today('12:00'))
    expect(buildAgenda([blip], { ...base, lingerMs: 0 })).toEqual([])
  })

  test('keeps overlapping events and sorts by start', () => {
    const groups = buildAgenda(
      [
        make('c', today('15:00'), today('16:00')),
        make('a', today('13:00'), today('17:00')),
        make('b', today('14:00'), today('15:30')),
      ],
      base,
    )
    expect(shape(groups)).toEqual([['2026-11-08', [], ['a', 'b', 'c']]])
  })

  test('breaks start ties by calendar order, even if the input is interleaved', () => {
    const groups = buildAgenda(
      [
        make('a-late', today('18:00'), today('19:00'), 'a'),
        make('b-tie', today('14:00'), today('15:00'), 'b'),
        make('a-tie', today('14:00'), today('15:30'), 'a'),
      ],
      base,
    )
    expect(shape(groups)).toEqual([['2026-11-08', [], ['a-tie', 'b-tie', 'a-late']]])
  })

  test('does not mutate its input', () => {
    const events = [
      make('b', today('15:00'), today('16:00')),
      make('a', today('13:00'), today('14:00')),
    ]
    const copy = [...events]
    buildAgenda(events, base)
    expect(events).toEqual(copy)
  })

  test('applies the lead time', () => {
    const event = make('x', today('12:30'), today('13:00'))
    expect(buildAgenda([event], base)[0]?.timed[0]).toMatchObject({ phase: 'soon', fill: 0.5 })
    expect(buildAgenda([event], { ...base, leadMs: 0 })[0]?.timed[0]).toMatchObject({
      phase: 'later',
      fill: 0,
    })
  })
})

describe('linger', () => {
  const MIN = 60_000
  const ended = make('ended', today('11:00'), today('12:00'))
  const at = (offsetMin: number) => ({ ...base, nowMs: NOW + offsetMin * MIN })

  test.each([
    ['exactly at the end', 0, 0],
    ['halfway through', 15, 15],
    ['one minute before it goes', 29, 29],
  ])('stays for 30 minutes by default: %s', (_name, offset, minutes) => {
    expect(buildAgenda([ended], at(offset))[0]?.timed[0]).toMatchObject({
      phase: 'finished',
      fill: 0,
      msUntilEnd: 0,
      msSinceEnd: minutes * MIN,
    })
  })

  test('goes away exactly when the linger runs out', () => {
    expect(buildAgenda([ended], at(30))).toEqual([])
  })

  test('is configurable and a negative value turns it off', () => {
    expect(buildAgenda([ended], { ...at(45), lingerMs: 60 * MIN })).toHaveLength(1)
    expect(buildAgenda([ended], { ...at(0), lingerMs: -5 * MIN })).toEqual([])
  })

  test('sorts ahead of what is running and counts toward the limit', () => {
    const running = make('running', today('11:30'), today('12:30'))
    const next = make('next', today('14:00'), today('15:00'))
    expect(shape(buildAgenda([next, running, ended], { ...at(0), limit: 2 }))).toEqual([
      ['2026-11-08', [], ['ended', 'running']],
    ])
  })

  test('an event ending just before midnight lingers under the new day', () => {
    const late = make('late', today('23:00'), today('23:50'))
    const groups = buildAgenda([late], { ...base, nowMs: Date.UTC(2026, 10, 9, 0, 10) })
    expect(shape(groups)).toEqual([['2026-11-09', [], ['late']]])
  })

  test('all-day and 24-hour events do not linger', () => {
    const allDay = make('all-day', '2026-11-07', '2026-11-08')
    const long = make('long', '2026-11-07T11:00', '2026-11-08T11:30')
    expect(buildAgenda([allDay, long], base)).toEqual([])
  })
})

describe('cancelled events', () => {
  const cancelled = (summary: string, start: string, end: string) => ({
    ...make(summary, start, end),
    cancelled: true,
  })
  const HOUR = 3_600_000

  test('today: visible until the start, gone from then on', () => {
    const event = cancelled('off', today('13:00'), today('14:00'))
    expect(shape(buildAgenda([event], base))).toEqual([['2026-11-08', [], ['off']]])
    expect(buildAgenda([event], { ...base, nowMs: NOW + HOUR })).toEqual([])
    expect(buildAgenda([event], { ...base, nowMs: NOW + 3 * HOUR })).toEqual([])
  })

  test('tomorrow: visible today and on through its start', () => {
    const event = cancelled('off', tomorrow('09:00'), tomorrow('10:00'))
    expect(shape(buildAgenda([event], base))).toEqual([['2026-11-09', [], ['off']]])
    const nextMorning = { ...base, nowMs: Date.UTC(2026, 10, 9, 8) }
    expect(shape(buildAgenda([event], nextMorning))).toEqual([['2026-11-09', [], ['off']]])
  })

  test('later than tomorrow stays hidden', () => {
    const event = cancelled('off', '2026-11-10T09:00', '2026-11-10T10:00')
    expect(buildAgenda([event], base)).toEqual([])
  })

  test('does not count toward the limit', () => {
    const events = [
      cancelled('off', today('13:00'), today('14:00')),
      make('a', today('14:00'), today('15:00')),
      make('b', today('16:00'), today('17:00')),
      make('c', today('18:00'), today('19:00')),
    ]
    expect(shape(buildAgenda(events, { ...base, limit: 2 }))).toEqual([
      ['2026-11-08', [], ['off', 'a', 'b']],
    ])
  })

  test('a picked day shows them, even in the past', () => {
    const event = cancelled('off', '2026-11-05T09:00', '2026-11-05T10:00')
    expect(shape(buildAgenda([event], { ...base, day: '2026-11-05' }))).toEqual([
      ['2026-11-05', [], ['off']],
    ])
    expect(buildAgenda([event], base)).toEqual([])
  })

  test('do not linger after the start', () => {
    const event = cancelled('off', today('11:00'), today('11:30'))
    expect(buildAgenda([event], base)).toEqual([])
  })
})

describe('dedupe', () => {
  const fromA = make('sync', today('14:00'), today('15:00'), 'a')
  const fromB = make('sync', today('14:00'), today('15:00'), 'b')
  const dupes = [fromA, fromB]

  test('first calendar wins', () => {
    const items = buildAgenda(dupes, base)[0]?.timed
    expect(items?.map((item) => item.event.calendarId)).toEqual(['a'])
  })

  test('first calendar wins regardless of a later duplicate in input order', () => {
    const items = buildAgenda([fromB, fromA], base)[0]?.timed
    expect(items?.map((item) => item.event.calendarId)).toEqual(['b'])
  })

  test('can be disabled', () => {
    expect(buildAgenda(dupes, { ...base, dedupe: false })[0]?.timed).toHaveLength(2)
  })

  test.each([
    ['summary', make('other', today('14:00'), today('15:00'), 'b')],
    ['start', make('sync', today('14:05'), today('15:00'), 'b')],
    ['end', make('sync', today('14:00'), today('15:05'), 'b')],
  ])('keeps events with a different %s', (_field, event) => {
    expect(buildAgenda([fromA, event], base)[0]?.timed).toHaveLength(2)
  })

  test('keeps identical events inside one calendar', () => {
    const same = make('sync', today('14:00'), today('15:00'), 'a')
    expect(buildAgenda([same, same], base)[0]?.timed).toHaveLength(2)
  })

  test('applies to all-day events', () => {
    const events = [
      make('off', '2026-11-08', '2026-11-09', 'a'),
      make('off', '2026-11-08', '2026-11-09', 'b'),
    ]
    expect(buildAgenda(events, base)[0]?.allDay).toHaveLength(1)
  })
})

describe('grouping', () => {
  test('groups by day with all-day items in their own leading list', () => {
    const groups = buildAgenda(
      [
        make('t1', today('14:00'), today('15:00')),
        make('t2', tomorrow('09:00'), tomorrow('10:00')),
        make('ad1', '2026-11-08', '2026-11-09'),
        make('ad2', '2026-11-09', '2026-11-10'),
      ],
      base,
    )
    expect(shape(groups)).toEqual([
      ['2026-11-08', ['ad1'], ['t1']],
      ['2026-11-09', ['ad2'], ['t2']],
    ])
  })

  test('all-day items have no fill but a correct status', () => {
    const groups = buildAgenda(
      [make('now', '2026-11-08', '2026-11-09'), make('next', '2026-11-09', '2026-11-10')],
      base,
    )
    expect(groups[0]?.allDay[0]).toMatchObject({ phase: 'running', fill: null })
    expect(groups[1]?.allDay[0]).toMatchObject({ phase: 'later', fill: null })
  })

  test('an active multi-day event appears on the current day only', () => {
    const groups = buildAgenda(
      [
        make('trip', '2026-11-05', '2026-11-12'),
        make('later', tomorrow('09:00'), tomorrow('10:00')),
      ],
      base,
    )
    expect(shape(groups)).toEqual([
      ['2026-11-08', ['trip'], []],
      ['2026-11-09', [], ['later']],
    ])
  })

  test('a future multi-day event appears on its first day only', () => {
    const groups = buildAgenda([make('trip', '2026-11-10', '2026-11-13')], base)
    expect(shape(groups)).toEqual([['2026-11-10', ['trip'], []]])
  })

  test('a timed event of 24 hours or more sits in the all-day list with no fill', () => {
    const groups = buildAgenda([make('long', today('23:00'), '2026-11-09T23:00')], base)
    expect(shape(groups)).toEqual([['2026-11-08', ['long'], []]])
    expect(groups[0]?.allDay[0]).toMatchObject({ phase: 'later', fill: null })
  })

  test('a short overnight event stays timed before and after midnight', () => {
    const night = make('night', today('23:30'), tomorrow('00:30'))
    const before = buildAgenda([night], { ...base, nowMs: Date.UTC(2026, 10, 8, 23) })
    expect(shape(before)).toEqual([['2026-11-08', [], ['night']]])
    expect(before[0]?.timed[0]).toMatchObject({ phase: 'soon', fill: 0.5 })

    const after = buildAgenda([night], { ...base, nowMs: Date.UTC(2026, 10, 9, 0, 15) })
    expect(shape(after)).toEqual([['2026-11-09', [], ['night']]])
    expect(after[0]?.timed[0]).toMatchObject({ phase: 'running', fill: 0.25 })
  })

  test('today is computed in the requested zone', () => {
    const event = make('trip', '2026-11-07', '2026-11-12', 'a', 'Pacific/Auckland')
    const groups = buildAgenda([event], {
      nowMs: Date.UTC(2026, 10, 8, 12),
      timeZone: 'Pacific/Auckland',
    })
    expect(groups[0]?.dayKey).toBe('2026-11-09')
  })
})

describe('limit', () => {
  const timed = [
    make('t1', today('13:00'), today('14:00')),
    make('t2', today('14:00'), today('15:00')),
    make('t3', tomorrow('09:00'), tomorrow('10:00')),
    make('t4', tomorrow('11:00'), tomorrow('12:00')),
  ]

  test('counts timed items across groups', () => {
    expect(shape(buildAgenda(timed, { ...base, limit: 3 }))).toEqual([
      ['2026-11-08', [], ['t1', 't2']],
      ['2026-11-09', [], ['t3']],
    ])
  })

  test('does not count all-day items on shown days', () => {
    const allDay = [make('a1', '2026-11-08', '2026-11-09'), make('a2', '2026-11-08', '2026-11-09')]
    expect(shape(buildAgenda([...allDay, ...timed], { ...base, limit: 1 }))).toEqual([
      ['2026-11-08', ['a1', 'a2'], ['t1']],
    ])
  })

  test('does not leave stray all-day groups past the cut', () => {
    const later = make('far', '2026-11-20', '2026-11-21')
    expect(shape(buildAgenda([...timed, later], { ...base, limit: 2 }))).toEqual([
      ['2026-11-08', [], ['t1', 't2']],
    ])
  })

  test('keeps later all-day groups when nothing was cut', () => {
    const later = make('far', '2026-11-20', '2026-11-21')
    expect(buildAgenda([...timed, later], { ...base, limit: 4 })).toHaveLength(3)
  })

  test('limit 0 hides timed items but not all-day items', () => {
    const allDay = make('a1', '2026-11-08', '2026-11-09')
    expect(shape(buildAgenda([...timed, allDay], { ...base, limit: 0 }))).toEqual([
      ['2026-11-08', ['a1'], []],
    ])
  })

  describe('limit 0 applies the all-day horizon', () => {
    const timeZone = 'Europe/Kyiv'
    const nowMs = Date.UTC(2026, 0, 15, 8)
    const events = [
      make('t1', '2026-01-15T10:00', '2026-01-15T11:00'),
      make('t2', '2026-01-15T12:00', '2026-01-15T13:00'),
      make('t3', '2026-01-20T10:00', '2026-01-20T11:00'),
      make('ad-today', '2026-01-15', '2026-01-16', 'a', timeZone),
      make('md-future', '2026-01-16', '2026-01-18', 'a', timeZone),
      make('ad-future', '2026-01-18', '2026-01-19', 'a', timeZone),
    ]

    test.each([[0], [1]])('limit %d keeps only the first day', (limit) => {
      const groups = buildAgenda(events, { nowMs, timeZone, limit })
      expect(groups.map((group) => group.dayKey)).toEqual(['2026-01-15'])
      expect(groups[0]?.allDay.map((item) => item.event.summary)).toEqual(['ad-today'])
    })

    test('hides future all-day items when the first timed item is far away', () => {
      const future = events.filter(({ summary }) => summary !== 't1' && summary !== 't2')
      const groups = buildAgenda(future, { nowMs, timeZone, limit: 0 })
      expect(shape(groups)).toEqual([['2026-01-15', ['ad-today'], []]])
    })

    test('keeps later all-day groups when there are no timed items to cut', () => {
      const allDay = events.filter(({ summary }) => !/^t\d$/.test(summary))
      const groups = buildAgenda(allDay, { nowMs, timeZone, limit: 0 })
      expect(groups.map((group) => group.dayKey)).toEqual([
        '2026-01-15',
        '2026-01-16',
        '2026-01-18',
      ])
    })

    test('keeps a requested day', () => {
      const dayEvents = [
        make('t', '2026-01-18T10:00', '2026-01-18T11:00'),
        make('ad', '2026-01-18', '2026-01-19', 'a', timeZone),
      ]
      const groups = buildAgenda(dayEvents, { nowMs, timeZone, limit: 0, day: '2026-01-18' })
      expect(shape(groups)).toEqual([['2026-01-18', ['ad'], []]])
    })
  })

  test('a limit counts after dedupe', () => {
    const events = [
      make('x', today('13:00'), today('14:00'), 'a'),
      make('x', today('13:00'), today('14:00'), 'b'),
      make('y', today('15:00'), today('16:00'), 'a'),
    ]
    expect(shape(buildAgenda(events, { ...base, limit: 2 }))).toEqual([
      ['2026-11-08', [], ['x', 'y']],
    ])
  })
})

describe('day filter', () => {
  const events = [
    make('today', today('14:00'), today('15:00')),
    make('tomorrow', tomorrow('09:00'), tomorrow('10:00')),
    make('trip', '2026-11-05', '2026-11-12'),
    make('after', '2026-11-13', '2026-11-14'),
    make('night', today('23:00'), tomorrow('02:00')),
  ]

  test('shows only events touching that day, under that day', () => {
    expect(shape(buildAgenda(events, { ...base, day: '2026-11-09' }))).toEqual([
      ['2026-11-09', ['trip'], ['night', 'tomorrow']],
    ])
  })

  test('a day with nothing is empty', () => {
    expect(buildAgenda(events, { ...base, day: '2026-12-25' })).toEqual([])
  })

  test('finished events are still dropped', () => {
    expect(buildAgenda(events, { ...base, day: '2026-11-07' })).toHaveLength(1)
    expect(shape(buildAgenda(events, { ...base, day: '2026-11-07' }))).toEqual([
      ['2026-11-07', ['trip'], []],
    ])
  })

  test('an event ending exactly at midnight does not touch the next day', () => {
    const event = make('late', today('22:00'), tomorrow('00:00'))
    expect(buildAgenda([event], { ...base, day: '2026-11-09' })).toEqual([])
  })
})
