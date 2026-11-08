import { describe, expect, test } from 'bun:test'

import { CalendarFeed, feedWindow, type FeedHass } from './feed.ts'

const WINDOW = { start: '2026-11-01T00:00:00.000Z', end: '2026-12-01T00:00:00.000Z' }
const event = (summary: string) => ({
  summary,
  start: '2026-11-09T10:00:00+00:00',
  end: '2026-11-09T11:00:00+00:00',
  all_day: false,
})
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

function fakeHass(options: { reject?: boolean; rest?: unknown } = {}) {
  const pushes = new Map<string, (message: { events: unknown }) => void>()
  const messages: Array<Record<string, unknown>> = []
  const paths: string[] = []
  let unsubscribed = 0
  const hass: FeedHass = {
    connection: {
      subscribeMessage: (callback, message) => {
        messages.push(message)
        if (options.reject) return Promise.reject(new Error('unknown_command'))
        pushes.set(message.entity_id as string, callback)
        return Promise.resolve(() => {
          unsubscribed += 1
        })
      },
    },
    callApi: (_method, path) => {
      paths.push(path)
      return Promise.resolve(options.rest ?? [])
    },
  }
  return { hass, pushes, messages, paths, unsubscribedCount: () => unsubscribed }
}

const summaries = (feed: CalendarFeed) => feed.events.map((item) => item.summary)

describe('CalendarFeed', () => {
  test('subscribes once per calendar and keeps calendar order', async () => {
    const { hass, pushes, messages } = fakeHass()
    let changes = 0
    const feed = new CalendarFeed(() => (changes += 1))
    feed.sync(hass, ['calendar.a', 'calendar.b'], WINDOW, 'UTC')
    await tick()
    expect(messages).toEqual([
      { type: 'calendar/event/subscribe', entity_id: 'calendar.a', ...WINDOW },
      { type: 'calendar/event/subscribe', entity_id: 'calendar.b', ...WINDOW },
    ])
    pushes.get('calendar.b')?.({ events: [event('second')] })
    pushes.get('calendar.a')?.({ events: [event('first')] })
    expect(summaries(feed)).toEqual(['first', 'second'])
    expect(changes).toBe(2)
    feed.stop()
  })

  test('does not resubscribe for the same window', async () => {
    const { hass, messages } = fakeHass()
    const feed = new CalendarFeed(() => undefined)
    feed.sync(hass, ['calendar.a'], WINDOW, 'UTC')
    feed.sync(hass, ['calendar.a'], WINDOW, 'UTC')
    await tick()
    expect(messages).toHaveLength(1)
    feed.stop()
  })

  test('keeps the last good list when a fetch fails', async () => {
    const { hass, pushes } = fakeHass()
    const feed = new CalendarFeed(() => undefined)
    feed.sync(hass, ['calendar.a'], WINDOW, 'UTC')
    await tick()
    pushes.get('calendar.a')?.({ events: [event('kept')] })
    pushes.get('calendar.a')?.({ events: null })
    expect(summaries(feed)).toEqual(['kept'])
    feed.stop()
  })

  test('unsubscribes on a new window and ignores stale pushes', async () => {
    const { hass, pushes, unsubscribedCount } = fakeHass()
    const feed = new CalendarFeed(() => undefined)
    feed.sync(hass, ['calendar.a'], WINDOW, 'UTC')
    await tick()
    const stale = pushes.get('calendar.a')
    feed.sync(hass, ['calendar.a'], { ...WINDOW, end: '2027-01-01T00:00:00.000Z' }, 'UTC')
    await tick()
    expect(unsubscribedCount()).toBe(1)
    stale?.({ events: [event('stale')] })
    expect(summaries(feed)).toEqual([])
    feed.stop()
  })

  test('a subscription that resolves after stop is released', async () => {
    const { hass, unsubscribedCount } = fakeHass()
    const feed = new CalendarFeed(() => undefined)
    feed.sync(hass, ['calendar.a'], WINDOW, 'UTC')
    feed.stop()
    await tick()
    expect(unsubscribedCount()).toBe(1)
  })

  test('falls back to REST when the subscription is unavailable', async () => {
    const rest = [
      {
        summary: 'rest',
        start: { dateTime: '2026-11-09T10:00:00+00:00' },
        end: { dateTime: '2026-11-09T11:00:00+00:00' },
      },
    ]
    const { hass, paths } = fakeHass({ reject: true, rest })
    const feed = new CalendarFeed(() => undefined)
    feed.sync(hass, ['calendar.a'], WINDOW, 'UTC')
    await tick()
    await tick()
    expect(paths[0]).toStartWith('calendars/calendar.a?start=2026-11-01T00%3A00')
    expect(summaries(feed)).toEqual(['rest'])
    feed.stop()
  })
})

describe('feedWindow', () => {
  test('covers yesterday and the coming weeks', () => {
    expect(feedWindow('2026-11-09', '2026-11-09', 'UTC')).toEqual({
      start: '2026-09-25T00:00:00.000Z',
      end: '2026-12-24T00:00:00.000Z',
    })
  })

  test('follows a browsed month in either direction', () => {
    expect(feedWindow('2026-11-09', '2027-03-10', 'UTC').end).toBe('2027-04-24T00:00:00.000Z')
    expect(feedWindow('2026-11-09', '2026-01-10', 'UTC').start).toBe('2025-11-26T00:00:00.000Z')
  })

  test('uses local midnight', () => {
    expect(feedWindow('2026-11-09', '2026-11-09', 'Europe/Kyiv').start).toBe(
      '2026-09-24T21:00:00.000Z',
    )
  })
})
