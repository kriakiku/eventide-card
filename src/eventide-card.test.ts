import { afterAll, beforeAll, describe, expect, setSystemTime, test } from 'bun:test'

import { GlobalRegistrator } from '@happy-dom/global-registrator'

import type { EventideCard as Card } from './eventide-card.ts'

const at = (day: number, time: string) => `2026-11-${String(day).padStart(2, '0')}T${time}:00+00:00`
const timed = (summary: string, day: number, start: string, end: string) => ({
  summary,
  start: at(day, start),
  end: at(day, end),
  all_day: false,
})

const WORK = [
  timed('Standup', 9, '09:15', '09:45'),
  timed('Daily sync', 9, '10:00', '10:15'),
  timed('Sprint demo', 9, '10:30', '11:30'),
  timed('Planning', 12, '15:00', '16:00'),
]
const HOME = [
  timed('Dentist', 9, '17:00', '17:45'),
  { summary: 'Holiday', start: '2026-11-09', end: '2026-11-10', all_day: true },
]

function fakeHass() {
  return {
    config: { time_zone: 'UTC' },
    locale: { language: 'en', time_format: '24', first_weekday: 'monday' },
    states: { 'calendar.work': { attributes: { friendly_name: 'Work' } } },
    callApi: () => Promise.resolve([]),
    connection: {
      subscribeMessage: (
        callback: (message: { events: unknown }) => void,
        message: Record<string, unknown>,
      ) => {
        queueMicrotask(() =>
          callback({ events: message.entity_id === 'calendar.work' ? WORK : HOME }),
        )
        return Promise.resolve(() => undefined)
      },
    },
  }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 5))

async function mount(config: Record<string, unknown> = {}): Promise<Card> {
  const element = document.createElement('eventide-card') as Card
  element.setConfig({ calendars: ['calendar.work', 'calendar.home'], ...config })
  element.hass = fakeHass() as never
  document.body.append(element)
  await tick()
  await element.updateComplete
  await tick()
  await element.updateComplete
  return element
}

const rows = (element: Card) => [...(element.shadowRoot?.querySelectorAll('.row') ?? [])]
const titleOf = (row: Element) => row.querySelector('.summary span')?.textContent
const rowByTitle = (element: Card, title: string) =>
  rows(element).find((row) => titleOf(row) === title)

beforeAll(async () => {
  GlobalRegistrator.register()
  setSystemTime(new Date('2026-11-09T10:08:00Z'))
  await import('./eventide-card.ts')
})

afterAll(async () => {
  setSystemTime()
  await GlobalRegistrator.unregister()
})

describe('eventide-card', () => {
  test('registers itself for the card picker', () => {
    expect(window.customCards?.map(({ type }) => type)).toContain('eventide-card')
  })

  test('rejects a config without calendars', () => {
    const element = document.createElement('eventide-card') as Card
    expect(() => element.setConfig({ calendars: [] })).toThrow()
  })

  test('renders each phase with its class, fill and label', async () => {
    const element = await mount()
    expect(rowByTitle(element, 'Standup')?.className).toContain('finished')
    expect(rowByTitle(element, 'Standup')?.querySelector('.fill')).toBeNull()
    expect(rowByTitle(element, 'Standup')?.querySelector('.eta')?.textContent).toContain('23 min')

    const running = rowByTitle(element, 'Daily sync')
    expect(running?.className).toContain('running')
    expect(running?.querySelector<HTMLElement>('.fill')?.style.width).toBe('46.7%')
    expect(running?.querySelector('.eta')?.textContent).toContain('7 min left')

    const soon = rowByTitle(element, 'Sprint demo')
    expect(soon?.className).toContain('soon')
    expect(soon?.querySelector<HTMLElement>('.fill')?.style.width).toBe('63.3%')
    expect(soon?.querySelector('.eta')?.textContent).toContain('in 22 min')
    expect(soon?.querySelector('.sub')?.textContent).toContain('10:30')
    expect(soon?.querySelector('.sub')?.textContent).toContain('Work')
    element.remove()
  })

  test('shows all-day events first, with no fill or label', async () => {
    const element = await mount()
    expect(titleOf(rows(element)[0] as Element)).toBe('Holiday')
    expect(rowByTitle(element, 'Holiday')?.querySelector('.fill')).toBeNull()
    expect(rowByTitle(element, 'Holiday')?.querySelector('.eta')).toBeNull()
    element.remove()
  })

  test('honors the limit', async () => {
    const element = await mount({ limit: 2 })
    expect(rows(element).map(titleOf)).toEqual(['Holiday', 'Standup', 'Daily sync'])
    element.remove()
  })

  test('draws a month that starts on the configured weekday', async () => {
    const element = await mount()
    const root = element.shadowRoot
    expect(root?.querySelector('.head .title')?.textContent).toContain('November 2026')
    expect(root?.querySelector('.dow')?.textContent).toBe('Mon')
    expect(root?.querySelectorAll('.day')).toHaveLength(42)
    expect(root?.querySelector('.day.today')?.textContent?.trim()).toBe('9')
    element.remove()
  })

  test('the first_weekday option overrides the locale', async () => {
    const sunday = await mount({ first_weekday: 'sunday' })
    expect(sunday.shadowRoot?.querySelector('.dow')?.textContent).toBe('Sun')
    sunday.remove()
    const saturday = await mount({ first_weekday: 'saturday' })
    expect(saturday.shadowRoot?.querySelector('.dow')?.textContent).toBe('Sat')
    saturday.remove()
  })

  test('switches to a week strip and a stacked layout when narrow', async () => {
    const element = await mount()
    element.width = 360
    await element.updateComplete
    expect(element.shadowRoot?.querySelectorAll('.day')).toHaveLength(7)
    expect(element.shadowRoot?.querySelector('.layout.wide')).toBeNull()
    element.width = 1000
    await element.updateComplete
    expect(element.shadowRoot?.querySelector('.layout.wide')).not.toBeNull()
    element.remove()
  })

  test('picking a day filters the agenda and a second tap clears it', async () => {
    const element = await mount()
    const day12 = [...(element.shadowRoot?.querySelectorAll<HTMLElement>('.day') ?? [])].find(
      (cell) => cell.textContent?.trim() === '12',
    )
    day12?.click()
    await element.updateComplete
    expect(rows(element).map(titleOf)).toEqual(['Planning'])
    day12?.click()
    await element.updateComplete
    expect(rows(element).length).toBeGreaterThan(1)
    element.remove()
  })

  test('applies rule icons and colors', async () => {
    const element = await mount({ rules: [{ match: 'demo', icon: 'mdi:x', color: 'red' }] })
    const row = rowByTitle(element, 'Sprint demo') as HTMLElement
    expect(row.getAttribute('style')).toContain('--c:red')
    expect(row.querySelector('ha-icon')).not.toBeNull()
    element.remove()
  })

  test('month navigation moves the grid and the data window', async () => {
    const element = await mount()
    const next = element.shadowRoot?.querySelectorAll<HTMLElement>('.nav')[1]
    next?.click()
    await element.updateComplete
    expect(element.shadowRoot?.querySelector('.head .title')?.textContent).toContain('December')
    element.remove()
  })
})
