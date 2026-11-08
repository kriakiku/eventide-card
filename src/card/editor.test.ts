import { describe, expect, test } from 'bun:test'

import { resolveConfig, type EventideConfig } from './config.ts'
import { configForm } from './editor.ts'

interface Item {
  name: string
  type?: string
  schema?: Item[]
}

const fields = (items: readonly Item[]): Item[] =>
  items.flatMap((item) => (item.schema ? fields(item.schema) : [item]))

describe('configForm', () => {
  const names = fields(configForm.schema).map(({ name }) => name)

  test('offers every option that fits a form', () => {
    expect(names.toSorted()).toEqual(
      [
        'calendars',
        'dedupe',
        'first_weekday',
        'lead_time',
        'limit',
        'linger',
        'rules',
        'series_colors',
        'show_cancelled',
        'show_clock',
        'show_navigation',
        'time_format',
        'today_color',
        'view',
      ].toSorted(),
    )
  })

  test('names every field and section', () => {
    const sections = configForm.schema.filter((item) => item.type === 'expandable')
    for (const { name } of [...fields(configForm.schema), ...sections]) {
      expect(configForm.computeLabel({ name })).toBeString()
    }
  })

  test('sends plain calendar names to YAML', () => {
    expect(() => configForm.assertConfig({ calendars: ['calendar.a'] })).toThrow()
    expect(() => configForm.assertConfig({ calendars: [{ entity: 'calendar.a' }] })).not.toThrow()
  })

  test('what the form produces is a valid config, even with cleared fields', () => {
    const config: EventideConfig = {
      calendars: [{ entity: 'calendar.a', name: '', color: '' }],
      view: 'month',
      lead_time: 30,
      today_color: '',
      time_format: '24',
      first_weekday: 'monday',
      rules: [{ match: '', title: 'x' }],
    }
    const resolved = resolveConfig(config)
    expect(resolved.calendars[0]?.color).not.toBe('')
    expect(resolved.calendars[0]?.name).toBeUndefined()
    expect(resolved.todayColor).toBeUndefined()
    expect(resolved.rules.rules).toHaveLength(0)
  })
})
