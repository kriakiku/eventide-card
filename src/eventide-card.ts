import { html, LitElement, nothing, type PropertyValues, type TemplateResult } from 'lit'

import {
  resolveConfig,
  type EventideConfig,
  type ResolvedConfig,
  type View,
} from './card/config.ts'
import { configForm } from './card/editor.ts'
import { CalendarFeed, feedWindow, type FeedHass } from './card/feed.ts'
import {
  clockFormatter,
  dayBackground,
  dayOfMonth,
  dotsOf,
  etaText,
  fadeEdges,
  groupTitle,
  monthTitle,
  resolveFirstWeekday,
  seriesColor,
  solidBackground,
  showsEta,
  labelOf,
  resolveTranslation,
  type Translation,
  weekdayShort,
  type LocaleLike,
} from './card/format.ts'
import { cardStyles } from './card/styles.ts'
import { buildAgenda, dedupeEvents } from './core/agenda.ts'
import { markCancelled } from './core/cancelled.ts'
import { buildMonthGrid, buildWeekGrid } from './core/grid.ts'
import { applyRules } from './core/rules.ts'
import { addDays, dayKeyOf } from './core/timezone.ts'
import type { AgendaGroup, AgendaItem, GridCell, NormalizedEvent } from './core/types.ts'

interface Hass extends FeedHass {
  config: { time_zone: string }
  locale: LocaleLike
  states: Record<string, { attributes: { friendly_name?: string } } | undefined>
  themes?: unknown
}

interface RenderContext {
  config: ResolvedConfig
  language: string
  todayKey: string
  clock: Intl.DateTimeFormat
  translation: Translation
  colors: Map<string, string>
  gridEvents: NormalizedEvent[]
}

const TICK_MS = 30_000
const WIDE_WIDTH = 640
const WEEK_WIDTH = 480

function shiftMonth(dayKey: string, delta: number): string {
  const year = Number(dayKey.slice(0, 4))
  const month = Number(dayKey.slice(5, 7)) - 1 + delta
  const shifted = new Date(Date.UTC(year, month, 1))
  return shifted.toISOString().slice(0, 10)
}

export class EventideCard extends LitElement {
  static override properties = {
    hass: { attribute: false },
    cardConfig: { state: true },
    now: { state: true },
    width: { state: true },
    anchor: { state: true },
    selected: { state: true },
  }

  static override styles = cardStyles

  declare hass?: Hass
  declare cardConfig?: ResolvedConfig
  declare now: number
  declare width: number
  declare anchor: string | null
  declare selected: string | null

  #feed = new CalendarFeed(() => this.requestUpdate())
  #timer: ReturnType<typeof setTimeout> | undefined
  #resize = new ResizeObserver(([entry]) => {
    if (entry) this.width = Math.round(entry.contentRect.width)
    this.#updateFade()
  })
  #onVisibility = () => this.#syncTimer()
  #onScroll = () => this.#updateFade()

  constructor() {
    super()
    this.now = Date.now()
    this.width = 0
    this.anchor = null
    this.selected = null
  }

  static getStubConfig(hass?: Hass): EventideConfig {
    const calendars = Object.keys(hass?.states ?? {})
      .filter((entity) => entity.startsWith('calendar.'))
      .slice(0, 2)
      .map((entity) => ({ entity }))
    return { calendars }
  }

  static getConfigForm() {
    return configForm
  }

  setConfig(raw: EventideConfig): void {
    const config = resolveConfig(raw)
    for (const error of config.rules.errors) {
      console.warn(`eventide-card: rule ${error.index} ignored: ${error.message}`)
    }
    this.cardConfig = config
  }

  getCardSize(): number {
    return 8
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6, rows: 'auto' }
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.#resize.observe(this)
    document.addEventListener('visibilitychange', this.#onVisibility)
    this.#syncTimer()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.#resize.disconnect()
    document.removeEventListener('visibilitychange', this.#onVisibility)
    clearTimeout(this.#timer)
    this.#timer = undefined
    this.#feed.stop()
  }

  #syncTimer(): void {
    clearTimeout(this.#timer)
    this.#timer = undefined
    if (document.hidden) return
    this.now = Date.now()
    this.#schedule()
  }

  #schedule(): void {
    this.#timer = setTimeout(
      () => {
        this.now = Date.now()
        this.#schedule()
      },
      TICK_MS - (Date.now() % TICK_MS),
    )
  }

  #updateFade(): void {
    const agenda = this.renderRoot.querySelector<HTMLElement>('.agenda')
    if (!agenda) return
    const { top, bottom } = fadeEdges(agenda.scrollTop, agenda.clientHeight, agenda.scrollHeight)
    agenda.classList.toggle('fade-top', top)
    agenda.classList.toggle('fade-bottom', bottom)
  }

  protected override updated(): void {
    this.#updateFade()
  }

  protected override shouldUpdate(changed: PropertyValues<this>): boolean {
    if (changed.size !== 1 || !changed.has('hass')) return true
    const previous = changed.get('hass')
    return (
      !previous ||
      previous.locale !== this.hass?.locale ||
      previous.themes !== this.hass?.themes ||
      previous.config.time_zone !== this.hass?.config.time_zone
    )
  }

  protected override willUpdate(): void {
    const { hass, cardConfig: config } = this
    if (!hass || !config || !this.isConnected) return
    const timeZone = hass.config.time_zone
    const todayKey = dayKeyOf(this.now, timeZone)
    this.#feed.sync(
      hass,
      config.calendars.map(({ entity }) => entity),
      feedWindow(todayKey, this.anchor ?? todayKey, timeZone),
      timeZone,
    )
  }

  #view(config: ResolvedConfig): Exclude<View, 'auto'> {
    if (config.view !== 'auto') return config.view
    return this.width > 0 && this.width < WEEK_WIDTH ? 'week' : 'month'
  }

  #shift(view: Exclude<View, 'auto'>, todayKey: string, direction: number): void {
    const anchor = this.anchor ?? todayKey
    this.anchor = view === 'week' ? addDays(anchor, direction * 7) : shiftMonth(anchor, direction)
    this.selected = null
  }

  #toggleDay(dayKey: string): void {
    this.selected = this.selected === dayKey ? null : dayKey
  }

  #reset(): void {
    this.anchor = null
    this.selected = null
  }

  #cell(cell: GridCell, context: RenderContext): TemplateResult {
    const background = cell.inMonth
      ? dayBackground(cell.calendarIds.flatMap((id) => context.colors.get(id) ?? []))
      : ''
    const classes = [
      'day',
      cell.isToday ? 'today' : '',
      cell.inMonth ? '' : 'out',
      background ? 'busy' : '',
      cell.dayKey === this.selected ? 'selected' : '',
    ]
    const { rows, more, hidden } = dotsOf(cell.inMonth ? cell.eventCalendarIds : [])
    return html`<button
      class=${classes.filter(Boolean).join(' ')}
      style=${background ? `--bg:${background}` : ''}
      @click=${() => this.#toggleDay(cell.dayKey)}
    >
      <span class="num">${dayOfMonth(cell.dayKey)}</span>
      ${
        rows.length > 0
          ? html`<span class="dots">
              ${rows.map(
                (row, index) =>
                  html`<span class="dot-row ${index > 0 ? 'second' : ''}">
                    ${row.map(
                      (id) => html`<i class="dot" style="--c:${context.colors.get(id) ?? ''}"></i>`,
                    )}
                    ${
                      more > 0 && index === rows.length - 1
                        ? html`<span
                            class="more"
                            style="--more:${solidBackground(
                              hidden.flatMap((id) => context.colors.get(id) ?? []),
                            )}"
                          ></span>`
                        : nothing
                    }
                  </span>`,
              )}
            </span>`
          : nothing
      }
    </button>`
  }

  #calendar(view: 'month' | 'week', context: RenderContext, firstWeekday: number): TemplateResult {
    const { todayKey, language } = context
    const anchorKey = this.anchor ?? todayKey
    const { dedupe } = context.config
    const events = dedupe ? dedupeEvents(context.gridEvents) : context.gridEvents
    const options = { firstWeekday, todayKey, events }
    const cells =
      view === 'week'
        ? buildWeekGrid({ anchorKey, ...options })
        : buildMonthGrid({
            year: Number(anchorKey.slice(0, 4)),
            month: Number(anchorKey.slice(5, 7)),
            ...options,
          })
    return html`<div class="calendar">
      <div class="head">
        <button class="title" @click=${() => this.#reset()}>
          ${monthTitle(anchorKey, language)}
        </button>
        ${
          context.config.showNavigation
            ? html`<div>
                <button
                  class="nav"
                  aria-label="Previous"
                  @click=${() => this.#shift(view, todayKey, -1)}
                >
                  <ha-icon icon="mdi:chevron-left"></ha-icon>
                </button>
                <button
                  class="nav"
                  aria-label="Next"
                  @click=${() => this.#shift(view, todayKey, 1)}
                >
                  <ha-icon icon="mdi:chevron-right"></ha-icon>
                </button>
              </div>`
            : nothing
        }
      </div>
      <div class="grid">
        ${cells
          .slice(0, 7)
          .map(({ dayKey }) => html`<div class="dow">${weekdayShort(dayKey, language)}</div>`)}
        ${cells.map((cell) => this.#cell(cell, context))}
      </div>
      ${
        context.config.showClock
          ? html`<div class="clock">${context.clock.format(this.now)}</div>`
          : nothing
      }
    </div>`
  }

  #timeText(item: AgendaItem, context: RenderContext): string {
    const { event } = item
    if (item.fill === null) return labelOf(context.translation, 'all_day')
    const [start, end] = [event.startMs, event.endMs].map((ms) => context.clock.format(ms))
    return `${start}–${end}`
  }

  #row(item: AgendaItem, context: RenderContext): TemplateResult {
    const { config, language, todayKey, colors } = context
    const { event, phase, fill } = item
    const rule = applyRules(config.rules, event.summary)
    const base = colors.get(event.calendarId) ?? 'var(--primary-color)'
    const color = rule.color ?? (config.seriesColors ? seriesColor(base, event.seriesId) : base)
    const calendar = config.calendars.find(({ entity }) => entity === event.calendarId)
    const name =
      calendar?.name ??
      this.hass?.states[event.calendarId]?.attributes.friendly_name ??
      event.calendarId
    const percent = event.cancelled ? 0 : Math.round((fill ?? 0) * 1000) / 10
    const eta = event.cancelled
      ? labelOf(context.translation, 'cancelled')
      : showsEta(item, todayKey, config.lingerMs)
        ? etaText(item, language, context.translation)
        : ''
    return html`<div class="row ${event.cancelled ? 'cancelled' : phase}" style="--c:${color}">
      ${percent > 0 ? html`<div class="fill" style="width:${percent}%"></div>` : nothing}
      <div class="tile">
        <small>${weekdayShort(event.startDay, language)}</small>
        <b>${dayOfMonth(event.startDay)}</b>
      </div>
      <div class="text">
        <div class="summary">
          ${rule.icon ? html`<ha-icon .icon=${rule.icon}></ha-icon>` : nothing}
          <span>${rule.title ?? event.summary}</span>
        </div>
        <div class="sub">${this.#timeText(item, context)} · ${name}</div>
      </div>
      ${eta ? html`<div class="eta">${eta}</div>` : nothing}
    </div>`
  }

  #group(group: AgendaGroup, context: RenderContext): TemplateResult {
    const { todayKey, language, translation } = context
    const title = groupTitle(group.dayKey, todayKey, addDays(todayKey, 1), language, translation)
    return html`<div class="group">${title}</div>
      ${[...group.allDay, ...group.timed].map((item) => this.#row(item, context))}`
  }

  protected override render() {
    const { hass, cardConfig: config } = this
    if (!hass || !config) return nothing
    const timeZone = hass.config.time_zone
    const language = hass.locale.language
    const marked = markCancelled(this.#feed.events, config.cancelledPattern)
    const gridEvents = marked.filter((event) => !event.cancelled)
    const context: RenderContext = {
      gridEvents,
      config,
      language,
      todayKey: dayKeyOf(this.now, timeZone),
      clock: clockFormatter(
        { ...hass.locale, time_format: config.timeFormat ?? hass.locale.time_format ?? 'language' },
        timeZone,
      ),
      translation: resolveTranslation(language, config.translations),
      colors: new Map(config.calendars.map(({ entity, color }) => [entity, color])),
    }
    const picked = this.selected ?? undefined
    const agenda = buildAgenda(config.showCancelled ? marked : gridEvents, {
      nowMs: this.now,
      timeZone,
      leadMs: config.leadMs,
      dedupe: config.dedupe,
      lingerMs: picked ? Number.MAX_SAFE_INTEGER : config.lingerMs,
      ...(picked ? { day: picked } : { limit: config.limit }),
    })
    const view = this.#view(config)
    const wide = view !== 'none' && this.width >= WIDE_WIDTH
    return html`<ha-card>
      <div
        class="layout ${wide ? 'wide' : ''} ${view === 'none' ? 'list-only' : ''}"
        style=${config.todayColor ? `--eventide-today:${config.todayColor}` : ''}
      >
        ${
          view === 'none'
            ? nothing
            : this.#calendar(
                view,
                context,
                resolveFirstWeekday({
                  ...hass.locale,
                  first_weekday: config.firstWeekday ?? hass.locale.first_weekday ?? 'language',
                }),
              )
        }
        <div class="agenda" @scroll=${this.#onScroll}>
          ${
            agenda.length > 0
              ? agenda.map((group) => this.#group(group, context))
              : html`<div class="empty">
                  ${labelOf(context.translation, picked ? 'free_day' : 'empty')}
                </div>`
          }
        </div>
      </div>
    </ha-card>`
  }
}

declare global {
  interface Window {
    customCards?: Array<{
      type: string
      name: string
      description: string
      documentationURL: string
    }>
  }
}

if (!customElements.get('eventide-card')) {
  customElements.define('eventide-card', EventideCard)
  window.customCards ??= []
  window.customCards.push({
    type: 'eventide-card',
    name: 'Eventide',
    description: 'A calendar where events rise before they start and ebb while they run.',
    documentationURL: 'https://github.com/kriakiku/eventide-card',
  })
}
