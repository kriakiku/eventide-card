import type { EventideConfig } from './config.ts'
import { WEEKDAYS } from './format.ts'

interface SchemaItem {
  name: string
  [key: string]: unknown
}

const LABELS: Record<string, string> = {
  calendars: 'Calendars',
  view: 'Calendar view',
  limit: 'Events in the list',
  timing: 'Timing',
  lead_time: 'Fill before the start',
  linger: 'Keep finished events',
  appearance: 'Appearance',
  first_weekday: 'First day of the week',
  time_format: 'Time format',
  today_color: 'Color of the current day',
  show_clock: 'Show a clock under the calendar',
  show_navigation: 'Show month buttons',
  series_colors: 'Own shade for recurring events',
  events: 'Events',
  show_cancelled: 'Show cancelled events',
  dedupe: 'Hide duplicates across calendars',
  rules: 'Rules',
}

const HELPERS: Record<string, string> = {
  lead_time: 'Minutes. Use 0 to turn it off.',
  linger: 'Minutes. Use 0 to turn it off.',
  today_color: 'Any CSS color. Leave empty to use the theme color.',
  rules: 'Set a title, icon or color by event title. Translations are set in YAML.',
}

const option = (value: string, label: string) => ({ value, label })
const dropdown = (options: Array<{ value: string; label: string }>) => ({
  select: { mode: 'dropdown', options },
})
const minutes = { number: { min: 0, mode: 'box', unit_of_measurement: 'min' } }
const toggle = (name: string, defaultValue: boolean): SchemaItem => ({
  name,
  default: defaultValue,
  selector: { boolean: {} },
})
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

const schema: SchemaItem[] = [
  {
    name: 'calendars',
    required: true,
    selector: {
      object: {
        multiple: true,
        reorder: true,
        label_field: 'entity',
        description_field: 'name',
        fields: {
          entity: {
            label: 'Calendar',
            required: true,
            selector: { entity: { domain: 'calendar' } },
          },
          name: { label: 'Name', selector: { text: {} } },
          color: { label: 'Color', selector: { text: {} } },
        },
      },
    },
  },
  {
    name: '',
    type: 'grid',
    schema: [
      {
        name: 'view',
        selector: dropdown([
          option('auto', 'Automatic'),
          option('month', 'Month'),
          option('week', 'Week'),
          option('none', 'List only'),
        ]),
      },
      { name: 'limit', default: 5, selector: { number: { min: 0, mode: 'box' } } },
    ],
  },
  {
    name: 'timing',
    type: 'expandable',
    title: 'Timing',
    flatten: true,
    icon: 'mdi:timer-sand',
    schema: [
      {
        name: '',
        type: 'grid',
        schema: [
          { name: 'lead_time', default: 60, selector: minutes },
          { name: 'linger', default: 30, selector: minutes },
        ],
      },
    ],
  },
  {
    name: 'appearance',
    type: 'expandable',
    title: 'Appearance',
    flatten: true,
    icon: 'mdi:palette',
    schema: [
      {
        name: '',
        type: 'grid',
        schema: [
          {
            name: 'first_weekday',
            selector: dropdown([
              option('language', 'From the language'),
              ...WEEKDAYS.map((day) => option(day, capitalize(day))),
            ]),
          },
          {
            name: 'time_format',
            selector: dropdown([
              option('language', 'From the language'),
              option('24', '24 hours'),
              option('12', '12 hours'),
            ]),
          },
        ],
      },
      { name: 'today_color', selector: { text: {} } },
      toggle('show_clock', false),
      toggle('show_navigation', true),
      toggle('series_colors', false),
    ],
  },
  {
    name: 'events',
    type: 'expandable',
    title: 'Events',
    flatten: true,
    icon: 'mdi:calendar-filter',
    schema: [
      toggle('show_cancelled', true),
      toggle('dedupe', true),
      {
        name: 'rules',
        selector: {
          object: {
            multiple: true,
            reorder: true,
            label_field: 'match',
            description_field: 'title',
            fields: {
              match: { label: 'Title pattern', selector: { text: {} } },
              exact: { label: 'Exact title', selector: { text: {} } },
              title: { label: 'New title', selector: { text: {} } },
              icon: { label: 'Icon', selector: { icon: {} } },
              color: { label: 'Color', selector: { text: {} } },
            },
          },
        },
      },
    ],
  },
]

export const configForm = {
  schema,
  computeLabel: ({ name }: { name: string }) => LABELS[name],
  computeHelper: ({ name }: { name: string }) => HELPERS[name],
  assertConfig: ({ calendars }: EventideConfig) => {
    if (Array.isArray(calendars) && calendars.some((item) => typeof item === 'string')) {
      throw new Error('Calendars written as plain names can only be edited in YAML')
    }
  },
}
