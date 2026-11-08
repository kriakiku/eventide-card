import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { dotsOf, seriesShift } from '../src/card/format.ts'
import {
  buildAgenda,
  buildMonthGrid,
  buildWeekGrid,
  normalizeEvents,
  phaseOf,
  type AgendaItem,
  type GridCell,
  type NormalizedEvent,
} from '../src/index.ts'

const OUT = join(import.meta.dir, '..', 'docs')
const ZONE = 'UTC'
const NOW = Date.UTC(2026, 10, 9, 10, 8)
const MIN = 60_000
const WORK = '#7F77DD'
const HOME = '#E0704A'
const ACCENT = '#5B50C8'
const ROW_H = 64
const ROW_GAP = 8
const COLORS: Record<string, string> = {
  work: WORK,
  home: HOME,
  family: '#2FA98C',
  sport: '#D4537E',
}
const LABELS: Record<string, string> = { work: 'Work', home: 'Personal' }
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const STYLE = `<style>
  text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  .card { fill: #FFFFFF; stroke: #E4E2EE; }
  .row { fill: #F5F4FA; }
  .tile { fill: #FFFFFF; }
  .rule { stroke: #E4E2EE; }
  .t1 { fill: #1F1D2B; }
  .t2 { fill: #6A6778; }
  .t3 { fill: #9C99A8; }
  .on { fill: #FFFFFF; }
  @media (prefers-color-scheme: dark) {
    .card { fill: #1C1B24; stroke: #33313F; }
    .row { fill: #272532; }
    .tile { fill: #1C1B24; }
    .rule { stroke: #3C3A49; }
    .t1 { fill: #F2F0F8; }
    .t2 { fill: #ABA8B8; }
    .t3 { fill: #7E7B8C; }
  }
</style>`

const fixture = (
  calendar: string,
  summary: string,
  day: number,
  start: string,
  end: string,
): NormalizedEvent[] => {
  const stamp = `2026-11-${String(day).padStart(2, '0')}`
  return normalizeEvents(
    [
      {
        summary,
        start: `${stamp}T${start}:00+00:00`,
        end: `${stamp}T${end}:00+00:00`,
        all_day: false,
      },
    ],
    { calendarId: calendar, timeZone: ZONE },
  )
}

const events = [
  ...fixture('work', 'Standup', 9, '09:15', '09:45'),
  ...fixture('work', 'Daily sync', 9, '10:00', '10:15'),
  ...fixture('work', 'Sprint demo', 9, '10:30', '11:30'),
  ...fixture('home', 'Language class', 9, '14:00', '15:00'),
  ...fixture('home', 'Dentist', 9, '17:00', '17:45'),
  ...fixture('work', 'Planning', 12, '15:00', '16:00'),
  ...fixture('home', 'Call', 12, '18:00', '18:30'),
  ...fixture('home', 'Concert', 14, '19:00', '21:00'),
  ...fixture('work', 'Retro', 17, '11:00', '12:00'),
  ...fixture('work', 'Quarterly review', 24, '10:00', '11:00'),
  ...fixture('home', 'Lunch', 27, '12:00', '13:00'),
  ...['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].flatMap((name, index) =>
    fixture(index < 5 ? 'work' : 'home', `Busy ${name}`, 19, '09:00', '09:30'),
  ),
  ...fixture('work', 'One', 5, '09:00', '09:30'),
  ...fixture('home', 'Two', 5, '10:00', '10:30'),
  ...fixture('work', 'Three', 5, '11:00', '11:30'),
  ...fixture('home', 'Four', 5, '12:00', '12:30'),
]

const agendaItems = (): AgendaItem[] =>
  buildAgenda(events, { nowMs: NOW, timeZone: ZONE, limit: 5 }).flatMap((group) => group.timed)

const escapeXml = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

const text = (x: number, y: number, cls: string, size: number, value: string, attrs = '') =>
  `<text x="${x}" y="${y}" class="${cls}" font-size="${size}" ${attrs}>${escapeXml(value)}</text>`

const clock = (ms: number) => new Date(ms).toISOString().slice(11, 16)

const span = (ms: number) => {
  const minutes = Math.round(ms / MIN)
  if (minutes < 60) return `${minutes} min`
  const rest = minutes % 60
  return `${Math.floor(minutes / 60)} h${rest ? ` ${rest} min` : ''}`
}

const etaOf = (item: AgendaItem) => {
  if (item.phase === 'finished') return `ended ${span(item.msSinceEnd)} ago`
  if (item.phase === 'running') return `${span(item.msUntilEnd)} left`
  return `in ${span(item.msUntilStart)}`
}

let clipId = 0

function renderRow(
  item: AgendaItem,
  x: number,
  y: number,
  width: number,
  color = COLORS[item.event.calendarId] ?? WORK,
): string {
  const { event, phase } = item
  const finished = phase === 'finished'
  const fillWidth = Math.round((item.fill ?? 0) * width)
  const id = `row${clipId++}`
  const date = new Date(event.startMs)
  const parts = [
    `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${width}" height="${ROW_H}" rx="16"/></clipPath>`,
    `<rect x="${x}" y="${y}" width="${width}" height="${ROW_H}" rx="16" class="row"/>`,
  ]
  if (fillWidth > 0) {
    parts.push(
      `<rect x="${x}" y="${y}" width="${fillWidth}" height="${ROW_H}" fill="${color}" opacity="0.28" clip-path="url(#${id})"/>`,
    )
  }
  if (phase === 'soon' || phase === 'running') {
    const dash = phase === 'soon' ? ' stroke-dasharray="5 4"' : ''
    parts.push(
      `<rect x="${x + 0.75}" y="${y + 0.75}" width="${width - 1.5}" height="${ROW_H - 1.5}" rx="15.25" fill="none" stroke="${color}" stroke-width="1.5"${dash}/>`,
    )
  }
  const tileX = x + 10
  const tileY = y + 9
  parts.push(
    `<rect x="${tileX}" y="${tileY}" width="42" height="46" rx="11" class="tile" stroke="${finished ? '#9C99A8' : color}" stroke-width="1.5"/>`,
    text(
      tileX + 21,
      tileY + 15,
      't2',
      11,
      SHORT_DAYS[date.getUTCDay()] ?? '',
      'text-anchor="middle"',
    ),
    `<line x1="${tileX + 1}" x2="${tileX + 41}" y1="${tileY + 20}" y2="${tileY + 20}" class="rule"/>`,
    text(
      tileX + 21,
      tileY + 38,
      finished ? 't3' : 't1',
      16,
      String(date.getUTCDate()),
      'text-anchor="middle" font-weight="600"',
    ),
    text(x + 66, y + 28, finished ? 't3' : 't1', 15, event.summary, 'font-weight="600"'),
    text(
      x + 66,
      y + 47,
      't2',
      12.5,
      `${clock(event.startMs)}–${clock(event.endMs)} · ${LABELS[event.calendarId] ?? ''}`,
    ),
    text(
      x + width - 14,
      y + 37,
      finished ? 't3' : 't1',
      12.5,
      etaOf(item),
      `text-anchor="end" font-weight="${finished ? 400 : 600}"`,
    ),
  )
  return parts.join('')
}

function renderCells(
  cells: GridCell[],
  x: number,
  y: number,
  cellW: number,
  cellH: number,
): string {
  const parts = WEEKDAYS.map((day, index) =>
    text(x + cellW * index + cellW / 2, y + 12, 't3', 11.5, day, 'text-anchor="middle"'),
  )
  cells.forEach((cell, index) => {
    const column = index % 7
    const row = Math.floor(index / 7)
    const cx = x + column * cellW
    const cy = y + 24 + row * cellH
    if (cell.isToday) {
      parts.push(
        `<rect x="${cx + 3}" y="${cy + 3}" width="${cellW - 6}" height="${cellH - 6}" rx="12" fill="${ACCENT}"/>`,
      )
    }
    const cls = cell.isToday ? 'on' : cell.inMonth ? 't1' : 't3'
    const weight = cell.isToday ? ' font-weight="600"' : ''
    parts.push(
      text(
        cx + cellW / 2,
        cy + cellH / 2 - 5,
        cls,
        14,
        String(Number(cell.dayKey.slice(8))),
        `text-anchor="middle"${weight}`,
      ),
    )
    if (cell.inMonth && !cell.isToday && cell.calendarIds.length > 0) {
      const colors = cell.calendarIds.map((id) => COLORS[id] ?? WORK)
      const gradientId = `day-${cell.dayKey}`
      if (colors.length > 1) {
        const stops = colors
          .map((color, stop) => {
            const offset = (stop / (colors.length - 1)) * 100
            return `<stop offset="${offset}%" stop-color="${color}"/>`
          })
          .join('')
        parts.push(
          `<linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient>`,
        )
      }
      const paint = colors.length > 1 ? `url(#${gradientId})` : colors[0]
      parts.push(
        `<rect x="${cx + 3}" y="${cy + 3}" width="${cellW - 6}" height="${cellH - 6}" rx="12" fill="${paint}" opacity="0.26"/>`,
      )
    }
    const { rows, more } = dotsOf(cell.inMonth ? cell.eventCalendarIds : [])
    rows.forEach((dotRow, rowIndex) => {
      const dotY = cy + cellH / 2 + 6 + rowIndex * 8
      const label = more > 0 && rowIndex === rows.length - 1 ? `+${more}` : ''
      const dotsWidth = (dotRow.length - 1) * 10 + 6
      const labelWidth = label.length * 5.5
      const total = dotsWidth + (label ? 4 + labelWidth : 0)
      const startX = cx + cellW / 2 - total / 2
      dotRow.forEach((id, dot) => {
        const fill = cell.isToday ? '#FFFFFF' : (COLORS[id] ?? WORK)
        parts.push(`<circle cx="${startX + 3 + dot * 10}" cy="${dotY}" r="3" fill="${fill}"/>`)
      })
      if (label) {
        parts.push(text(startX + dotsWidth + 4, dotY + 3.5, cell.isToday ? 'on' : 't2', 10, label))
      }
    })
  })
  return parts.join('')
}

const svg = (width: number, height: number, label: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(label)}">${STYLE}${body}</svg>\n`

function renderList(items: AgendaItem[], x: number, y: number, width: number): string {
  return [
    text(x, y + 14, 't2', 13, 'Today'),
    ...items.map((item, index) => renderRow(item, x, y + 26 + index * (ROW_H + ROW_GAP), width)),
  ].join('')
}

function hero(): string {
  const width = 880
  const items = agendaItems()
  const cells = buildMonthGrid({
    year: 2026,
    month: 11,
    firstWeekday: 1,
    todayKey: '2026-11-09',
    events,
  })
  const listX = 424
  const height = 26 + 26 + items.length * (ROW_H + ROW_GAP) - ROW_GAP + 26 + 4
  const cellH = (height - 24 - 44 - 24 - 24) / (cells.length / 7)
  return svg(
    width,
    height,
    'Eventide card: month grid next to an agenda with a finished, a running and an upcoming event',
    [
      `<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="24" class="card"/>`,
      text(28, 46, 't1', 18, 'November 2026', 'font-weight="600"'),
      renderCells(cells, 24, 66, 52, cellH),
      renderList(items, listX, 26, width - listX - 26),
    ].join(''),
  )
}

function panel(): string {
  const width = 360
  const items = agendaItems()
  const cells = buildWeekGrid({
    anchorKey: '2026-11-09',
    firstWeekday: 1,
    todayKey: '2026-11-09',
    events,
  })
  const listY = 142
  const height = listY + 26 + items.length * (ROW_H + ROW_GAP) - ROW_GAP + 20
  return svg(
    width,
    height,
    'Eventide card in a narrow layout: a week strip above the agenda',
    [
      `<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="24" class="card"/>`,
      text(20, 40, 't1', 17, 'This week', 'font-weight="600"'),
      renderCells(cells, 18, 58, 46, 50),
      renderList(items, 16, listY, width - 32),
    ].join(''),
  )
}

function states(): string {
  const width = 560
  const start = NOW + 20 * MIN
  const base = events.find((event) => event.summary === 'Sprint demo')
  if (!base) throw new Error('missing fixture')
  const event = { ...base, startMs: start, endMs: start + 60 * MIN }
  const samples: Array<[string, number]> = [
    ['Later', start - 150 * MIN],
    ['Soon', start - 18 * MIN],
    ['Running', start + 21 * MIN],
    ['Finished', start + 72 * MIN],
  ]
  const body = samples.map(([label, now], index) => {
    const y = 10 + index * (ROW_H + ROW_GAP)
    return (
      text(0, y + 37, 't2', 13, label, 'font-weight="600"') +
      renderRow({ event, ...phaseOf(event, now) }, 84, y, width - 84)
    )
  })
  const height = 20 + samples.length * (ROW_H + ROW_GAP) - ROW_GAP
  return svg(width, height, 'The four states of an event row', body.join(''))
}

const fade = (name: string, on: number, off: number) =>
  `@keyframes ${name} { 0%, ${on - 0.01}% { opacity: 0 } ${on}%, ${off - 0.01}% { opacity: 1 } ${off}%, 100% { opacity: 0 } }`

function gradientPreview(): string {
  const cellW = 72
  const cellH = 72
  const width = cellW * 7 + 40
  const height = 24 + cellH + 40
  const plan: string[][] = [
    ['work'],
    ['work', 'home'],
    ['work', 'home', 'family'],
    ['work', 'home', 'family', 'sport'],
    ['home', 'family'],
    ['sport'],
    [],
  ]
  const days = plan.flatMap((calendars, index) => {
    const day = `2026-11-${String(9 + index).padStart(2, '0')}`
    return calendars.map((calendarId) => ({ calendarId, startDay: day, endDay: day }))
  })
  const cells = buildWeekGrid({
    anchorKey: '2026-11-09',
    firstWeekday: 1,
    todayKey: '2026-11-01',
    events: days,
  })
  return svg(
    width,
    height,
    'Days tinted by one, two, three and four calendars',
    [
      `<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="24" class="card"/>`,
      renderCells(cells, 20, 20, cellW, cellH),
    ].join(''),
  )
}

const toLinear = (value: number) =>
  value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
const fromLinear = (value: number) =>
  value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055

const toHex = (value: number) =>
  Math.round(Math.min(1, Math.max(0, fromLinear(Math.max(0, value)))) * 255)
    .toString(16)
    .padStart(2, '0')

function rotateHue(hex: string, degrees: number): string {
  const [r, g, b] = [1, 3, 5].map((at) =>
    toLinear(Number.parseInt(hex.slice(at, at + 2), 16) / 255),
  )
  const red = r ?? 0
  const green = g ?? 0
  const blue = b ?? 0
  const l = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue)
  const m = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue)
  const s = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue)
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a0 = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const b0 = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const angle = (degrees * Math.PI) / 180
  const a1 = a0 * Math.cos(angle) - b0 * Math.sin(angle)
  const b1 = a0 * Math.sin(angle) + b0 * Math.cos(angle)
  const l2 = (lightness + 0.3963377774 * a1 + 0.2158037573 * b1) ** 3
  const m2 = (lightness - 0.1055613458 * a1 - 0.0638541728 * b1) ** 3
  const s2 = (lightness - 0.0894841775 * a1 - 1.291485548 * b1) ** 3
  const channels = [
    4.0767416621 * l2 - 3.3077115913 * m2 + 0.2309699292 * s2,
    -1.2684380046 * l2 + 2.6097574011 * m2 - 0.3413193965 * s2,
    -0.0041960863 * l2 - 0.7034186147 * m2 + 1.707614701 * s2,
  ]
  return `#${channels.map(toHex).join('')}`
}

function seriesPreview(): string {
  const width = 520
  const series = [
    ...fixture('work', 'Team daily', 9, '10:00', '10:15'),
    ...fixture('work', 'Design review', 9, '10:30', '11:30'),
    ...fixture('work', 'Retro', 9, '10:50', '11:20'),
    ...fixture('home', 'Language class', 9, '14:00', '15:00'),
    ...fixture('home', 'Piano lesson', 9, '17:00', '18:00'),
  ]
  const body = series.map((event, index) => {
    const base = COLORS[event.calendarId] ?? WORK
    const color = rotateHue(base, seriesShift(event.seriesId))
    return renderRow({ event, ...phaseOf(event, NOW) }, 0, index * (ROW_H + ROW_GAP), width, color)
  })
  const height = series.length * (ROW_H + ROW_GAP) - ROW_GAP
  return svg(
    width,
    height,
    'Event rows whose colors vary around their calendar color',
    body.join(''),
  )
}

function clockPreview(): string {
  const width = 420
  const cellW = 54
  const cellH = 52
  const cells = buildMonthGrid({
    year: 2026,
    month: 11,
    firstWeekday: 1,
    todayKey: '2026-11-09',
    events,
  })
  const gridHeight = 24 + (cells.length / 7) * cellH
  const height = 66 + gridHeight + 84
  return svg(
    width,
    height,
    'Eventide month grid with the optional clock centered below it',
    [
      `<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="24" class="card"/>`,
      text(28, 46, 't1', 18, 'November 2026', 'font-weight="600"'),
      renderCells(cells, (width - cellW * 7) / 2, 66, cellW, cellH),
      text(
        width / 2,
        66 + gridHeight + 56,
        't1',
        44,
        clock(NOW),
        'text-anchor="middle" font-weight="600"',
      ),
    ].join(''),
  )
}

function tide(): string {
  const width = 720
  const height = 104
  const rowX = 12
  const rowY = 14
  const rowW = width - 24
  const rowH = 76
  const labels: Array<[string, string, number, number]> = [
    ['a', 'in 2 h', 0, 12],
    ['b', 'in 20 min', 12, 46],
    ['c', '40 min left', 46, 84],
    ['d', 'ended 5 min ago', 84, 100.01],
  ]
  const animation = `<style>
  .tide { transform-box: fill-box; transform-origin: left; animation: tide 12s linear infinite; }
  .wait, .live { animation: 12s step-end infinite; opacity: 0; }
  .wait { animation-name: wait; }
  .live { animation-name: live; }
  .lbl { opacity: 0; animation: 12s step-end infinite; }
  .dim { animation: dim 12s step-end infinite; }
  @keyframes dim { 0%, 83.99% { opacity: 1 } 84%, 100% { opacity: 0.45 } }
  @keyframes tide { 0%, 12% { transform: scaleX(0) } 46% { transform: scaleX(1) } 84%, 100% { transform: scaleX(0) } }
  ${fade('wait', 12, 46)}
  ${fade('live', 46, 84)}
  ${labels.map(([id, , on, off]) => fade(`l${id}`, on, off)).join('\n  ')}
  @media (prefers-reduced-motion: reduce) {
    .tide { animation: none; transform: scaleX(0.6); }
    .wait, .lbl, .dim { animation: none; }
    .live, .lc { animation: none; opacity: 1; }
  }
</style>`
  return svg(
    width,
    height,
    'An event row filling up before the event starts and draining while it runs',
    [
      animation,
      `<clipPath id="tide-clip"><rect x="${rowX}" y="${rowY}" width="${rowW}" height="${rowH}" rx="20"/></clipPath>`,
      `<rect x="${rowX}" y="${rowY}" width="${rowW}" height="${rowH}" rx="20" class="row"/>`,
      `<g clip-path="url(#tide-clip)"><rect class="tide" x="${rowX}" y="${rowY}" width="${rowW}" height="${rowH}" fill="${WORK}" opacity="0.32"/></g>`,
      `<rect class="wait" x="${rowX + 0.75}" y="${rowY + 0.75}" width="${rowW - 1.5}" height="${rowH - 1.5}" rx="19" fill="none" stroke="${WORK}" stroke-width="1.5" stroke-dasharray="6 5"/>`,
      `<rect class="live" x="${rowX + 0.75}" y="${rowY + 0.75}" width="${rowW - 1.5}" height="${rowH - 1.5}" rx="19" fill="none" stroke="${WORK}" stroke-width="1.5"/>`,
      '<g class="dim">',
      `<rect x="${rowX + 12}" y="${rowY + 12}" width="46" height="52" rx="12" class="tile" stroke="${WORK}" stroke-width="1.5"/>`,
      text(rowX + 35, rowY + 29, 't2', 12, 'Mon', 'text-anchor="middle"'),
      `<line x1="${rowX + 13}" x2="${rowX + 57}" y1="${rowY + 35}" y2="${rowY + 35}" class="rule"/>`,
      text(rowX + 35, rowY + 56, 't1', 18, '9', 'text-anchor="middle" font-weight="600"'),
      text(rowX + 76, rowY + 34, 't1', 17, 'Sprint demo', 'font-weight="600"'),
      text(rowX + 76, rowY + 56, 't2', 13.5, '10:30–11:30 · Work'),
      ...labels.map(([id, label]) =>
        text(
          rowX + rowW - 18,
          rowY + 43,
          `t1 lbl l${id}`,
          14,
          label,
          `text-anchor="end" font-weight="600" style="animation-name:l${id}"`,
        ),
      ),
      '</g>',
    ].join(''),
  )
}

mkdirSync(OUT, { recursive: true })
const images: Record<string, string> = {
  'clock.svg': clockPreview(),
  'gradient.svg': gradientPreview(),
  'series.svg': seriesPreview(),
  'hero.svg': hero(),
  'panel.svg': panel(),
  'states.svg': states(),
  'tide.svg': tide(),
}
for (const [name, content] of Object.entries(images)) writeFileSync(join(OUT, name), content)
