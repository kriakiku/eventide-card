import { normalizeEvents } from '../core/normalize.ts'
import { addDays, startOfDayMs } from '../core/timezone.ts'
import type { NormalizedEvent } from '../core/types.ts'

export interface FeedHass {
  connection: {
    subscribeMessage: (
      callback: (message: { events: unknown }) => void,
      message: Record<string, unknown>,
    ) => Promise<() => unknown>
  }
  callApi: (method: 'GET', path: string) => Promise<unknown>
}

export interface FeedWindow {
  start: string
  end: string
}

const POLL_MS = 300_000

export function feedWindow(todayKey: string, anchorKey: string, timeZone: string): FeedWindow {
  const earliest = [addDays(todayKey, -1), addDays(anchorKey, -45)].toSorted()[0] ?? todayKey
  const latest = [addDays(todayKey, 45), addDays(anchorKey, 45)].toSorted().at(-1) ?? todayKey
  return {
    start: new Date(startOfDayMs(earliest, timeZone)).toISOString(),
    end: new Date(startOfDayMs(latest, timeZone)).toISOString(),
  }
}

export class CalendarFeed {
  #onChange: () => void
  #events = new Map<string, NormalizedEvent[]>()
  #entities: string[] = []
  #key = ''
  #generation = 0
  #stops: Array<() => unknown> = []

  constructor(onChange: () => void) {
    this.#onChange = onChange
  }

  get events(): NormalizedEvent[] {
    return this.#entities.flatMap((entity) => this.#events.get(entity) ?? [])
  }

  sync(hass: FeedHass, entities: string[], window: FeedWindow, timeZone: string): void {
    const key = JSON.stringify([entities, window, timeZone])
    if (key === this.#key) return
    this.stop()
    this.#key = key
    this.#entities = entities
    const generation = this.#generation
    for (const entity of entities) void this.#start(hass, entity, window, timeZone, generation)
  }

  stop(): void {
    this.#generation += 1
    this.#key = ''
    for (const stop of this.#stops) stop()
    this.#stops = []
  }

  #apply(entity: string, raw: unknown, timeZone: string, generation: number): void {
    if (generation !== this.#generation || raw === null || raw === undefined) return
    this.#events.set(entity, normalizeEvents(raw, { calendarId: entity, timeZone }))
    this.#onChange()
  }

  #addStop(stop: () => unknown, generation: number): void {
    if (generation === this.#generation) this.#stops.push(stop)
    else stop()
  }

  async #start(
    hass: FeedHass,
    entity: string,
    window: FeedWindow,
    timeZone: string,
    generation: number,
  ): Promise<void> {
    try {
      const unsubscribe = await hass.connection.subscribeMessage(
        (message) => this.#apply(entity, message.events, timeZone, generation),
        { type: 'calendar/event/subscribe', entity_id: entity, ...window },
      )
      this.#addStop(unsubscribe, generation)
    } catch {
      this.#poll(hass, entity, window, timeZone, generation)
    }
  }

  #poll(
    hass: FeedHass,
    entity: string,
    window: FeedWindow,
    timeZone: string,
    generation: number,
  ): void {
    const path = `calendars/${entity}?start=${encodeURIComponent(window.start)}&end=${encodeURIComponent(window.end)}`
    const load = () =>
      hass.callApi('GET', path).then(
        (raw) => this.#apply(entity, raw, timeZone, generation),
        () => undefined,
      )
    void load()
    const timer = setInterval(() => void load(), POLL_MS)
    this.#addStop(() => clearInterval(timer), generation)
  }
}
