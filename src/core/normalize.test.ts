import { describe, expect, test } from 'bun:test'

import { normalizeEvent, normalizeEvents } from './normalize.ts'

const u = Date.UTC
const kyiv = { calendarId: 'calendar.work', timeZone: 'Europe/Kyiv' }
const at = (timeZone: string) => ({ calendarId: 'calendar.a', timeZone })

const restTimed = {
  start: { dateTime: '2026-11-08T10:00:00+02:00' },
  end: { dateTime: '2026-11-08T11:30:00+02:00' },
  summary: 'Standup',
  description: 'Daily',
  location: null,
  uid: 'abc',
  recurrence_id: null,
  rrule: null,
  status: 'confirmed',
}

const wsTimed = {
  start: '2026-11-08T08:00:00+00:00',
  end: '2026-11-08T09:30:00+00:00',
  summary: 'Standup',
  description: 'Daily',
  uid: 'abc',
  status: 'confirmed',
  all_day: false,
}

const restAllDay = {
  start: { date: '2026-11-08' },
  end: { date: '2026-11-09' },
  summary: 'Holiday',
  description: null,
  location: null,
  uid: null,
  recurrence_id: null,
  rrule: null,
  status: null,
}

const wsAllDay = { start: '2026-11-08', end: '2026-11-09', summary: 'Holiday', all_day: true }

describe('wire shapes', () => {
  test('REST timed event', () => {
    expect(normalizeEvent(restTimed, kyiv)).toEqual({
      key: expect.any(String),
      seriesId: expect.any(String),
      cancelled: false,
      calendarId: 'calendar.work',
      summary: 'Standup',
      description: 'Daily',
      location: null,
      startMs: u(2026, 10, 8, 8),
      endMs: u(2026, 10, 8, 9, 30),
      allDay: false,
      startDay: '2026-11-08',
      endDay: '2026-11-08',
    })
  })

  test('subscribe timed event matches REST', () => {
    expect(normalizeEvent(wsTimed, kyiv)).toEqual(normalizeEvent(restTimed, kyiv))
  })

  test('REST all-day event in the HA zone', () => {
    expect(normalizeEvent(restAllDay, kyiv)).toEqual({
      key: expect.any(String),
      seriesId: expect.any(String),
      cancelled: false,
      calendarId: 'calendar.work',
      summary: 'Holiday',
      description: null,
      location: null,
      startMs: u(2026, 10, 7, 22),
      endMs: u(2026, 10, 8, 22),
      allDay: true,
      startDay: '2026-11-08',
      endDay: '2026-11-08',
    })
  })

  test('subscribe all-day event matches REST', () => {
    expect(normalizeEvent(wsAllDay, kyiv)).toEqual(normalizeEvent(restAllDay, kyiv))
  })
})

describe('time parsing', () => {
  test.each([
    ['2026-11-08T10:00:00+02:00', u(2026, 10, 8, 8)],
    ['2026-11-08T10:00:00-05:00', u(2026, 10, 8, 15)],
    ['2026-11-08T10:00:00+05:45', u(2026, 10, 8, 4, 15)],
    ['2026-11-08T10:00:00Z', u(2026, 10, 8, 10)],
    ['2026-11-08T10:00:00.123456+00:00', u(2026, 10, 8, 10) + 123],
    ['2026-11-08T10:00:00.5+00:00', u(2026, 10, 8, 10) + 500],
    ['2026-11-08T10:00:00+00:53:28', u(2026, 10, 8, 9, 6, 32)],
    ['2026-11-08T10:00+00:00', u(2026, 10, 8, 10)],
  ])('%s', (start, startMs) => {
    const end = '2026-11-09T12:00:00+00:00'
    expect(normalizeEvent({ start, end, summary: 'x' }, at('UTC'))?.startMs).toBe(startMs)
  })
})

describe('day boundaries', () => {
  test('all-day end is exclusive', () => {
    const event = normalizeEvent(
      { start: '2026-11-08', end: '2026-11-11', summary: 'Trip' },
      at('UTC'),
    )
    expect(event).toMatchObject({
      startDay: '2026-11-08',
      endDay: '2026-11-10',
      startMs: u(2026, 10, 8),
      endMs: u(2026, 10, 11),
    })
  })

  test('an all-day event with equal dates lasts one day', () => {
    const event = normalizeEvent(
      { start: '2026-11-08', end: '2026-11-08', summary: 'x' },
      at('UTC'),
    )
    expect(event).toMatchObject({ endDay: '2026-11-08', endMs: u(2026, 10, 9) })
  })

  test('all-day dates use the HA zone, including a day with no midnight', () => {
    const event = normalizeEvent(
      { start: '2026-03-08', end: '2026-03-09', summary: 'x' },
      at('America/Havana'),
    )
    expect(event).toMatchObject({ startMs: u(2026, 2, 8, 5), endMs: u(2026, 2, 9, 4) })
    expect(event?.startDay).toBe('2026-03-08')
    expect(event?.endDay).toBe('2026-03-08')
  })

  test('the day keys of timed events come from the HA zone, not the wire offset', () => {
    const event = normalizeEvent(
      { start: '2026-11-08T23:30:00+00:00', end: '2026-11-09T00:30:00+00:00', summary: 'x' },
      kyiv,
    )
    expect(event).toMatchObject({ startDay: '2026-11-09', endDay: '2026-11-09' })
  })

  test('a timed event ending exactly at midnight does not touch the next day', () => {
    const event = normalizeEvent(
      { start: '2026-11-08T22:00:00+02:00', end: '2026-11-09T00:00:00+02:00', summary: 'x' },
      kyiv,
    )
    expect(event).toMatchObject({ startDay: '2026-11-08', endDay: '2026-11-08' })
  })

  test('a timed event crossing midnight touches both days', () => {
    const event = normalizeEvent(
      { start: '2026-11-08T23:00:00+02:00', end: '2026-11-09T00:00:01+02:00', summary: 'x' },
      kyiv,
    )
    expect(event).toMatchObject({ startDay: '2026-11-08', endDay: '2026-11-09' })
  })

  test('a zero-length event at midnight stays on its own day', () => {
    const instant = '2026-11-09T00:00:00+02:00'
    const event = normalizeEvent({ start: instant, end: instant, summary: 'x' }, kyiv)
    expect(event).toMatchObject({ startDay: '2026-11-09', endDay: '2026-11-09' })
    expect(event?.endMs).toBe(event?.startMs)
  })
})

describe('malformed input is dropped', () => {
  const start = '2026-11-08T10:00:00+00:00'
  const end = '2026-11-08T11:00:00+00:00'

  test.each([
    ['null', null],
    ['a number', 7],
    ['a string', 'event'],
    ['no summary', { start, end }],
    ['non-string summary', { start, end, summary: 5 }],
    ['no start', { end, summary: 'x' }],
    ['no end', { start, summary: 'x' }],
    ['garbage start', { start: 'soon', end, summary: 'x' }],
    ['empty object start', { start: {}, end, summary: 'x' }],
    ['numeric start', { start: 1762596000, end, summary: 'x' }],
    ['naive datetime', { start: '2026-11-08T10:00:00', end, summary: 'x' }],
    ['impossible date', { start: '2026-02-30T10:00:00+00:00', end, summary: 'x' }],
    ['impossible hour', { start: '2026-11-08T24:00:00+00:00', end, summary: 'x' }],
    ['impossible offset', { start: '2026-11-08T10:00:00+24:00', end, summary: 'x' }],
    ['impossible all-day date', { start: '2026-02-30', end: '2026-03-01', summary: 'x' }],
    ['date mixed with datetime', { start: '2026-11-08', end, summary: 'x' }],
    ['REST date mixed with datetime', { start: { date: '2026-11-08' }, end, summary: 'x' }],
    ['end before start', { start: end, end: start, summary: 'x' }],
    ['all-day end before start', { start: '2026-11-09', end: '2026-11-08', summary: 'x' }],
    ['all-day past the last day', { start: '9999-12-31', end: '9999-12-31', summary: 'x' }],
    [
      'REST all-day past the last day',
      { start: { date: '9999-12-31' }, end: { date: '9999-12-31' }, summary: 'x' },
    ],
  ])('%s', (_name, raw) => {
    expect(normalizeEvent(raw, at('UTC'))).toBeNull()
    expect(normalizeEvent(raw, at('Europe/Kyiv'))).toBeNull()
  })

  test('an overflowing all-day event does not lose the batch', () => {
    const overflowing = { start: '9999-12-31', end: '9999-12-31', summary: 'x', all_day: true }
    const events = normalizeEvents([wsAllDay, overflowing], at('UTC'))
    expect(events.map((event) => event.summary)).toEqual(['Holiday'])
  })

  test('an all-day event ending on the last day is kept', () => {
    const raw = { start: '9999-12-30', end: '9999-12-31', summary: 'x', all_day: true }
    expect(normalizeEvent(raw, at('UTC'))).toMatchObject({
      startDay: '9999-12-30',
      endDay: '9999-12-30',
    })
  })

  test.each([[null], [undefined], [{ events: [] }], ['x']])('non-array list %p', (raw) => {
    expect(normalizeEvents(raw, at('UTC'))).toEqual([])
  })

  test('good events survive next to bad ones', () => {
    const events = normalizeEvents([null, wsTimed, { summary: 'x' }, restAllDay], at('UTC'))
    expect(events.map((event) => event.summary)).toEqual(['Standup', 'Holiday'])
  })

  test('non-string and empty optional fields become null', () => {
    const event = normalizeEvent({ start, end, summary: '', description: 4, location: '' }, kyiv)
    expect(event).toMatchObject({ summary: '', description: null, location: null })
  })
})

describe('cancelled', () => {
  const context = { calendarId: 'calendar.a', timeZone: 'UTC' }
  const base = {
    summary: 'x',
    start: '2026-11-09T10:00:00+00:00',
    end: '2026-11-09T11:00:00+00:00',
  }

  test('follows the status when Home Assistant sends one', () => {
    expect(normalizeEvent({ ...base, status: 'cancelled' }, context)?.cancelled).toBe(true)
    expect(normalizeEvent({ ...base, status: 'CANCELLED' }, context)?.cancelled).toBe(true)
    expect(normalizeEvent({ ...base, status: 'confirmed' }, context)?.cancelled).toBe(false)
    expect(normalizeEvent(base, context)?.cancelled).toBe(false)
  })
})

describe('seriesId', () => {
  const context = { calendarId: 'calendar.a', timeZone: 'UTC' }
  const base = { start: '2026-11-09T10:00:00+00:00', end: '2026-11-09T11:00:00+00:00' }

  test('is shared by every occurrence of a recurring event', () => {
    const first = normalizeEvent({ ...base, summary: 'x', uid: 'u1', recurrence_id: 'a' }, context)
    const second = normalizeEvent({ ...base, summary: 'y', uid: 'u1', recurrence_id: 'b' }, context)
    expect(first?.seriesId).toBe('u1')
    expect(second?.seriesId).toBe('u1')
  })

  test('falls back to the title without a uid', () => {
    expect(normalizeEvent({ ...base, summary: 'Daily', uid: null }, context)?.seriesId).toBe(
      'Daily',
    )
    expect(
      normalizeEvent({ ...base, summary: 'Daily', uid: '  ' }, context)?.seriesId,
    ).toBeDefined()
  })
})

describe('keys', () => {
  const base = { start: '2026-11-08T10:00:00+00:00', end: '2026-11-08T11:00:00+00:00' }
  const keyOf = (fields: object, calendarId = 'calendar.a') =>
    normalizeEvent({ ...base, summary: 'x', ...fields }, { calendarId, timeZone: 'UTC' })?.key

  test('are stable for the same event from both wire shapes', () => {
    expect(normalizeEvent(wsTimed, kyiv)?.key).toBe(normalizeEvent(restTimed, kyiv)?.key)
  })

  test('differ by calendar, uid and recurrence', () => {
    const keys = [
      keyOf({ uid: 'a' }),
      keyOf({ uid: 'b' }),
      keyOf({ uid: 'a' }, 'calendar.b'),
      keyOf({ uid: 'a', recurrence_id: '20261108' }),
    ]
    expect(new Set(keys).size).toBe(4)
  })

  test('differ by summary when there is no uid', () => {
    expect(keyOf({ summary: 'one' })).not.toBe(keyOf({ summary: 'two' }))
  })

  test('are unique inside a list even for identical events', () => {
    const raw = { ...base, summary: 'x' }
    const keys = normalizeEvents([raw, raw, raw], at('UTC')).map((event) => event.key)
    expect(new Set(keys).size).toBe(3)
  })
})
