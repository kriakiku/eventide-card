import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { mdiBookOpenVariant, mdiPresentation, mdiSync, mdiTooth } from '@mdi/js'

import {
  dayOfMonth,
  dotsOf,
  etaText,
  groupTitle,
  labelOf,
  monthTitle,
  resolveTranslation,
  seriesShift,
  weekdayShort,
  type Translation,
} from '../src/card/format.ts'
import {
  buildAgenda,
  applyRules,
  buildMonthGrid,
  buildWeekGrid,
  compileRules,
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
const ROW_H = 72
const ROW_GAP = 8
const COLORS: Record<string, string> = {
  work: WORK,
  home: HOME,
  family: '#2FA98C',
  sport: '#D4537E',
}
const LABELS: Record<string, string> = { work: 'Work', home: 'Personal' }
const CORNER_EXPONENT = 2 ** 1.6

interface Locale {
  language: string
  translation: Translation
  calendarNames: Record<string, string>
}

const ENGLISH: Locale = {
  language: 'en',
  translation: resolveTranslation('en'),
  calendarNames: LABELS,
}

const LITHUANIAN: Locale = {
  language: 'lt',
  translation: resolveTranslation('lt', {
    lt: {
      today: 'Šiandien',
      tomorrow: 'Rytoj',
      all_day: 'Visą dieną',
      cancelled: 'Atšaukta',
      empty: 'Artimiausių įvykių nėra',
      free_day: 'Šią dieną laisva',
      starts_in: 'po {time}',
      time_left: 'liko {time}',
      ended_ago: 'baigėsi prieš {time}',
      just_ended: 'ką tik baigėsi',
      minutes: '{n} min.',
      hours: '{n} val.',
    },
  }),
  calendarNames: { work: 'Darbas', home: 'Asmeninis' },
}

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

const agendaItems = (source: NormalizedEvent[], limit = 5): AgendaItem[] =>
  buildAgenda(source, { nowMs: NOW, timeZone: ZONE, limit }).flatMap((group) => group.timed)

const escapeXml = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

const text = (x: number, y: number, cls: string, size: number, value: string, attrs = '') =>
  `<text x="${x}" y="${y}" class="${cls}" font-size="${size}" ${attrs}>${escapeXml(value)}</text>`

const signedPower = (value: number) => Math.sign(value) * Math.abs(value) ** (2 / CORNER_EXPONENT)

function rounded(x: number, y: number, width: number, height: number, radius: number, attrs = '') {
  const corners: Array<[number, number, number]> = [
    [x + width - radius, y + radius, -90],
    [x + width - radius, y + height - radius, 0],
    [x + radius, y + height - radius, 90],
    [x + radius, y + radius, 180],
  ]
  const points = corners.flatMap(([cx, cy, from]) =>
    Array.from({ length: 13 }, (_, step) => {
      const angle = ((from + (step / 12) * 90) * Math.PI) / 180
      const px = cx + radius * signedPower(Math.cos(angle))
      const py = cy + radius * signedPower(Math.sin(angle))
      return `${px.toFixed(2)} ${py.toFixed(2)}`
    }),
  )
  return `<path d="M${points.join('L')}Z" ${attrs}/>`
}

const clock = (ms: number) => new Date(ms).toISOString().slice(11, 16)

let clipId = 0

const fit = (value: string, size: number, maxWidth: number) => {
  const chars = Math.floor(maxWidth / (size * 0.5))
  return value.length <= chars ? value : `${value.slice(0, Math.max(1, chars - 1)).trimEnd()}…`
}

function renderRow(
  item: AgendaItem,
  x: number,
  y: number,
  width: number,
  options: { color?: string; locale?: Locale; icon?: string } = {},
): string {
  const { event, phase } = item
  const color = options.color ?? COLORS[event.calendarId] ?? WORK
  const locale = options.locale ?? ENGLISH
  const finished = phase === 'finished' || event.cancelled
  const fillWidth = Math.round((item.fill ?? 0) * width)
  const id = `row${clipId++}`
  const eta = event.cancelled
    ? labelOf(locale.translation, 'cancelled')
    : etaText(item, locale.language, locale.translation)
  const iconSpace = options.icon ? 28 : 0
  const textWidth = width - 72 - 14 - eta.length * 15 * 0.49 - 10
  const parts = [
    `<clipPath id="${id}">${rounded(x, y, width, ROW_H, 20)}</clipPath>`,
    rounded(x, y, width, ROW_H, 20, 'class="row"'),
  ]
  if (fillWidth > 0) {
    parts.push(
      `<rect x="${x}" y="${y}" width="${fillWidth}" height="${ROW_H}" fill="${color}" opacity="0.3" clip-path="url(#${id})"/>`,
    )
  }
  if (phase === 'soon' || phase === 'running') {
    const dash = phase === 'soon' ? ' stroke-dasharray="5 4"' : ''
    parts.push(
      rounded(
        x + 0.75,
        y + 0.75,
        width - 1.5,
        ROW_H - 1.5,
        19.25,
        `fill="none" stroke="${color}" stroke-width="1.5"${dash}`,
      ),
    )
  }
  const tileX = x + 10
  const tileY = y + 9
  parts.push(
    rounded(
      tileX,
      tileY,
      48,
      54,
      14,
      `class="tile" stroke="${finished ? '#9C99A8' : color}" stroke-width="1.5"`,
    ),
    text(
      tileX + 24,
      tileY + 15,
      't2',
      13,
      weekdayShort(event.startDay, locale.language),
      'text-anchor="middle"',
    ),
    `<line x1="${tileX + 1}" x2="${tileX + 47}" y1="${tileY + 21}" y2="${tileY + 21}" class="rule"/>`,
    text(
      tileX + 24,
      tileY + 44,
      finished ? 't3' : 't1',
      19,
      String(dayOfMonth(event.startDay)),
      'text-anchor="middle" font-weight="600"',
    ),
    text(
      x + 72 + iconSpace,
      y + 32,
      finished ? 't3' : 't1',
      19,
      fit(event.summary, 19, textWidth - iconSpace),
      `font-weight="600"${event.cancelled ? ' text-decoration="line-through"' : ''}`,
    ),
    text(
      x + 72,
      y + 54,
      't2',
      15,
      fit(
        `${clock(event.startMs)}–${clock(event.endMs)} · ${locale.calendarNames[event.calendarId] ?? ''}`,
        15,
        textWidth,
      ),
    ),
    text(
      x + width - 14,
      y + 41,
      finished ? 't3' : 't1',
      15,
      eta,
      `text-anchor="end" font-weight="${finished ? 400 : 600}"`,
    ),
  )
  if (options.icon) {
    parts.push(
      `<path transform="translate(${x + 72} ${y + 14}) scale(${22 / 24})" d="${options.icon}" class="${finished ? 't3' : 't1'}"/>`,
    )
  }
  return parts.join('')
}

function renderCells(
  cells: GridCell[],
  x: number,
  y: number,
  cellW: number,
  cellH: number,
  scale = 1,
  language = 'en',
): string {
  const parts = cells
    .slice(0, 7)
    .map(({ dayKey }, index) =>
      text(
        x + cellW * index + cellW / 2,
        y + 12,
        't3',
        13.5,
        weekdayShort(dayKey, language),
        'text-anchor="middle"',
      ),
    )
  cells.forEach((cell, index) => {
    const column = index % 7
    const row = Math.floor(index / 7)
    const cx = x + column * cellW
    const cy = y + 24 + row * cellH
    if (cell.isToday) {
      parts.push(rounded(cx + 3, cy + 3, cellW - 6, cellH - 6, 15, `fill="${ACCENT}"`))
    }
    const cls = cell.isToday ? 'on' : cell.inMonth ? 't1' : 't3'
    const weight = cell.isToday ? ' font-weight="600"' : ''
    parts.push(
      text(
        cx + cellW / 2,
        cy + cellH / 2 - 5 * scale,
        cls,
        18 * scale,
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
      parts.push(rounded(cx + 3, cy + 3, cellW - 6, cellH - 6, 15, `fill="${paint}" opacity="0.3"`))
    }
    const { rows, more, hidden } = dotsOf(cell.inMonth ? cell.eventCalendarIds : [])
    rows.forEach((dotRow, rowIndex) => {
      const dotY = cy + cellH / 2 + (9 + rowIndex * 11.5) * scale
      const center = cx + cellW / 2
      const step = 11.5 * scale
      dotRow.forEach((id, dot) => {
        const offset = rowIndex === 0 ? (dot - (dotRow.length - 1) / 2) * step : (dot - 0.5) * step
        const fill = cell.isToday ? '#FFFFFF' : (COLORS[id] ?? WORK)
        parts.push(
          `<circle cx="${center + offset}" cy="${dotY}" r="${3.6 * scale}" fill="${fill}"/>`,
        )
      })
      if (more > 0 && rowIndex === rows.length - 1) {
        const slot = center + step / 2
        const hiddenColors = [...new Set(hidden.map((id) => COLORS[id] ?? WORK))]
        const moreId = `more-${cell.dayKey}`
        if (hiddenColors.length > 1 && !cell.isToday) {
          const moreStops = hiddenColors
            .map((color, stop) => {
              const at = (stop / (hiddenColors.length - 1)) * 100
              return `<stop offset="${at}%" stop-color="${color}"/>`
            })
            .join('')
          parts.push(
            `<linearGradient id="${moreId}" x1="0" y1="0" x2="1" y2="1">${moreStops}</linearGradient>`,
          )
        }
        const solid = hiddenColors.length > 1 ? `url(#${moreId})` : hiddenColors[0]
        const circleFill = cell.isToday ? '#FFFFFF' : solid
        const size = 0.9 * scale
        parts.push(
          `<path transform="translate(${slot - 4 * size} ${dotY - 4 * size}) scale(${size})" fill-rule="evenodd" fill="${circleFill}" d="M0 4a4 4 0 1 0 8 0a4 4 0 1 0-8 0ZM3.25 1.5h1.5v1.75h1.75v1.5H4.75v1.75h-1.5V4.75H1.5v-1.5h1.75Z"/>`,
        )
      }
    })
  })
  return parts.join('')
}

const svg = (width: number, height: number, label: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(label)}">${STYLE}${body}</svg>\n`

function renderList(
  items: AgendaItem[],
  x: number,
  y: number,
  width: number,
  locale: Locale = ENGLISH,
): string {
  const title = groupTitle(
    '2026-11-09',
    '2026-11-09',
    '2026-11-10',
    locale.language,
    locale.translation,
  )
  return [
    text(x, y + 14, 't2', 16, title),
    ...items.map((item, index) =>
      renderRow(item, x, y + 28 + index * (ROW_H + ROW_GAP), width, { locale }),
    ),
  ].join('')
}

function monthCard(source: NormalizedEvent[], locale: Locale, label: string, limit = 5): string {
  const width = 880
  const items = agendaItems(source, limit)
  const cells = buildMonthGrid({
    year: 2026,
    month: 11,
    firstWeekday: 1,
    todayKey: '2026-11-09',
    events: source.filter((event) => !event.cancelled),
  })
  const listX = 424
  const height = 26 + 28 + Math.max(items.length, 5) * (ROW_H + ROW_GAP) - ROW_GAP + 26
  const cellH = (height - 94 - 24) / (cells.length / 7)
  return svg(
    width,
    height,
    label,
    [
      rounded(0.5, 0.5, width - 1, height - 1, 24, 'class="card"'),
      text(28, 50, 't1', 24, monthTitle('2026-11-09', locale.language), 'font-weight="600"'),
      renderCells(cells, 24, 70, 52, cellH, 1, locale.language),
      renderList(items, listX, 26, width - listX - 26, locale),
    ].join(''),
  )
}

function hero(): string {
  return monthCard(
    events,
    ENGLISH,
    'Eventide card: month grid next to an agenda with a finished, a running and an upcoming event',
  )
}

function lithuanian(): string {
  const today = [
    ...fixture('home', 'LOFTAS Fest', 9, '09:15', '09:45'),
    ...fixture('home', 'Odontologas', 9, '10:00', '10:15'),
    ...fixture('work', 'Anglų kalbos pamoka', 9, '10:30', '11:30'),
    ...fixture('home', 'Valgyti šaltibarščius', 9, '14:00', '14:30'),
  ]
  return monthCard(
    [...today, ...events.filter((event) => event.startDay !== '2026-11-09')],
    LITHUANIAN,
    'Eventide card translated into Lithuanian',
    today.length,
  )
}

function panel(): string {
  const width = 360
  const items = agendaItems(events)
  const cells = buildWeekGrid({
    anchorKey: '2026-11-09',
    firstWeekday: 1,
    todayKey: '2026-11-09',
    events,
  })
  const listY = 158
  const height = listY + 28 + items.length * (ROW_H + ROW_GAP) - ROW_GAP + 20
  return svg(
    width,
    height,
    'Eventide card in a narrow layout: a week strip above the agenda',
    [
      rounded(0.5, 0.5, width - 1, height - 1, 24, 'class="card"'),
      text(20, 42, 't1', 20, 'This week', 'font-weight="600"'),
      renderCells(cells, 18, 58, 46, 62),
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
      text(0, y + 41, 't2', 13, label, 'font-weight="600"') +
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
      renderCells(cells, 20, 20, cellW, cellH, 1.25),
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
    return renderRow({ event, ...phaseOf(event, NOW) }, 0, index * (ROW_H + ROW_GAP), width, {
      color,
    })
  })
  const height = series.length * (ROW_H + ROW_GAP) - ROW_GAP
  return svg(
    width,
    height,
    'Event rows whose colors vary around their calendar color',
    body.join(''),
  )
}

function cancelledPreview(): string {
  const width = 520
  const rows = [
    ...fixture('work', 'Sprint demo', 9, '10:30', '11:30'),
    ...fixture('work', 'Budget review', 9, '13:00', '14:00'),
    ...fixture('home', 'Dentist', 9, '17:00', '17:45'),
  ]
  const body = rows.map((event, index) => {
    const y = index * (ROW_H + ROW_GAP)
    if (index !== 1) return renderRow({ event, ...phaseOf(event, NOW) }, 0, y, width)
    const off = { ...event, cancelled: true }
    return renderRow({ event: off, ...phaseOf(off, NOW), phase: 'later', fill: 0 }, 0, y, width)
  })
  const height = rows.length * (ROW_H + ROW_GAP) - ROW_GAP
  return svg(width, height, 'A cancelled event struck through between two others', body.join(''))
}

function iconsPreview(): string {
  const width = 520
  const paths: Record<string, string> = {
    'mdi:sync': mdiSync,
    'mdi:presentation': mdiPresentation,
    'mdi:book-open-variant': mdiBookOpenVariant,
    'mdi:tooth': mdiTooth,
  }
  const rules = compileRules([
    { match: 'daily', icon: 'mdi:sync' },
    { match: 'demo|review', icon: 'mdi:presentation' },
    { match: 'language|class', icon: 'mdi:book-open-variant' },
    { match: 'dentist', icon: 'mdi:tooth' },
  ])
  const names = ['Daily sync', 'Sprint demo', 'Language class', 'Dentist']
  const rows = events.filter((event) => names.includes(event.summary))
  const body = rows.map((event, index) => {
    const { icon } = applyRules(rules, event.summary)
    return renderRow({ event, ...phaseOf(event, NOW) }, 0, index * (ROW_H + ROW_GAP), width, {
      icon: paths[icon ?? ''] ?? '',
    })
  })
  const height = rows.length * (ROW_H + ROW_GAP) - ROW_GAP
  return svg(width, height, 'Event rows with an icon before the title', body.join(''))
}

function clockPreview(): string {
  const width = 420
  const cellW = 54
  const cellH = 62
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
  'cancelled.svg': cancelledPreview(),
  'clock.svg': clockPreview(),
  'gradient.svg': gradientPreview(),
  'series.svg': seriesPreview(),
  'hero.svg': hero(),
  'icons.svg': iconsPreview(),
  'lithuanian.svg': lithuanian(),
  'panel.svg': panel(),
  'states.svg': states(),
  'tide.svg': tide(),
}
for (const [name, content] of Object.entries(images)) writeFileSync(join(OUT, name), content)
