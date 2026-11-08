<div align="center">

# Eventide

**A Home Assistant calendar card where events rise before they start and ebb while they run.**

[![CI](https://github.com/kriakiku/eventide-card/actions/workflows/ci.yml/badge.svg)](https://github.com/kriakiku/eventide-card/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-7F77DD.svg)](LICENSE)
![Status: pre-release](https://img.shields.io/badge/status-pre--release-E0704A.svg)

<img src="docs/hero.svg" alt="Eventide card with a month grid next to an agenda of finished, running and upcoming events" width="760">

</div>

> [!IMPORTANT]
> Eventide is an early pre-release: the configuration can still change, there is no visual editor and it isn't in HACS yet. The images on this page are design previews from [a script](scripts/render-docs.ts): the card images use the output of the real core, and the animation is drawn by hand.

## The idea

Most calendar cards tell you what is on your calendar. Eventide shows you how close it is.

Every event row is its own progress bar. As a meeting approaches, the row fills up like a rising tide. When it starts, the row is full, and it drains as the time runs out. You can read the state of your day from across the room, without reading a single number.

<p align="center">
  <img src="docs/tide.svg" alt="An event row filling up before the event starts and draining while it runs" width="640">
</p>

## Four states, one row

<table>
<tr>
<td width="58%">
<img src="docs/states.svg" alt="The later, soon, running and finished states of an event row">
</td>
<td>

**Later.** A quiet row with the time left until the start.

**Soon.** A dashed outline, and the fill rises during the lead time, one hour by default.

**Running.** A solid outline, and the fill drains until the end.

**Finished.** Dimmed, and a timed event stays for 30 more minutes, so you can still see what you just left.

</td>
</tr>
</table>

A row keeps the same height in every state, so the list doesn't jump when an event changes state.

## Fits the screen it's on

<table>
<tr>
<td align="center" width="40%">
<img src="docs/panel.svg" alt="Eventide in a narrow layout with a week strip above the agenda" width="300">
</td>
<td>

The layout follows the width of the card rather than the device:

- **Wide:** the month grid next to the agenda.
- **Medium:** the month grid above the agenda.
- **Narrow:** a week strip above the agenda, for phones and wall panels.

It's meant to be light enough for a low-powered wall tablet. The card runs no continuous animations, and one timer recalculates the states every 30 seconds without touching the network.

</td>
</tr>
</table>

## Details that are already handled

The core is pure TypeScript with no runtime dependencies. It's covered by tests across time zones that are hard to get right, such as those with a DST change at midnight or a 30-minute shift.

- **Time zones:** days are computed in your Home Assistant time zone, not the browser's.
- **Both Home Assistant formats:** it reads the REST and the websocket event shapes.
- **Overnight events:** a 23:30–00:30 meeting behaves like any other meeting.
- **All-day and long events:** anything all-day or 24 hours and longer sits in its own group, with no fill.
- **Overlaps:** events at the same time are all kept.
- **Duplicates:** the same event in two calendars is shown once.
- **Rules:** case-insensitive patterns set icons and colors by event title, including in Cyrillic. An invalid pattern is reported, not fatal.

## Configuration

> [!NOTE]
> Until 1.0 the configuration may change between releases.

```yaml
type: custom:eventide-card
view: auto
lead_time: 60
linger: 30
limit: 5
calendars:
  - entity: calendar.work
    color: '#7F77DD'
  - entity: calendar.personal
    color: '#E0704A'
rules:
  - match: 'demo|review'
    icon: mdi:presentation
  - match: 'dentist|doctor'
    icon: mdi:stethoscope
    color: '#E0704A'
```

| Option          | Default         | Description                                                           |
| --------------- | --------------- | --------------------------------------------------------------------- |
| `calendars`     | none            | The calendar entities to show, each with an optional `color`.         |
| `view`          | `auto`          | `auto`, `month`, `week` or `none` to show only the agenda.            |
| `lead_time`     | `60`            | Minutes before the start when the row begins to fill. `0` disables.   |
| `linger`        | `30`            | Minutes a finished timed event stays in the list. `0` disables.       |
| `limit`         | `5`             | How many timed events to show. Finished ones count.                   |
| `dedupe`        | `true`          | Show an event found in several calendars only once.                   |
| `first_weekday` | your HA setting | First day of the week: `monday` to `sunday`, or `language`.           |
| `rules`         | none            | Patterns that set `icon` and `color` by title, first match per field. |

## Roadmap

- [x] Time and state core with tests
- [x] Live data from Home Assistant, with a REST fallback
- [x] The card: month grid, week strip, agenda and responsive layouts
- [x] Translations (English, Russian, Ukrainian)
- [ ] First release
- [ ] Visual editor
- [ ] HACS support

## Development

You need [mise](https://mise.jdx.dev), which installs the pinned Bun version.

```sh
mise install
bun install
bun run check        # format, lint, types, tests and build
bun run docs:images  # redraw the images in docs/
```

```text
src/eventide-card.ts  the card element
src/card/        config, translations and the live data feed
src/core/        pure logic: nothing reads the clock or the system time zone
  normalize.ts   Home Assistant events to one internal form
  phase.ts       later, soon, running, finished and the fill
  agenda.ts      filtering, ordering, grouping and limits
  grid.ts        month and week grids
  rules.ts       icons and colors by title
  timezone.ts    day arithmetic built on Intl
scripts/         the generator for the README images
```

## License

[MIT](LICENSE)
