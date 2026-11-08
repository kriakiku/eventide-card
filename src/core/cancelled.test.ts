import { describe, expect, test } from 'bun:test'

import { DEFAULT_CANCELLED_PATTERN, markCancelled } from './cancelled.ts'
import type { NormalizedEvent } from './types.ts'

const event = (summary: string) => ({ summary, cancelled: false }) as NormalizedEvent
const pattern = new RegExp(DEFAULT_CANCELLED_PATTERN, 'iu')

describe('markCancelled', () => {
  test.each([
    ['Canceled: Team sync', 'Team sync'],
    ['Cancelled: Team sync', 'Team sync'],
    ['CANCELED:Team sync', 'Team sync'],
    ['Отменено: Встреча', 'Встреча'],
    ['Скасовано: Зустріч', 'Зустріч'],
    ['Abgesagt: Termin', 'Termin'],
    ['Atšaukta: Susitikimas', 'Susitikimas'],
  ])('%s', (summary, stripped) => {
    expect(markCancelled([event(summary)], pattern)[0]).toMatchObject({
      cancelled: true,
      summary: stripped,
    })
  })

  test.each(['Team sync', 'Canceled plans review', 'Why we cancelled: a retro'])(
    'leaves %s alone',
    (summary) => {
      expect(markCancelled([event(summary)], pattern)[0]).toMatchObject({
        cancelled: false,
        summary,
      })
    },
  )

  test('keeps the title when nothing is left after the prefix', () => {
    expect(markCancelled([event('Canceled:')], pattern)[0]?.summary).toBe('Canceled:')
  })

  test('does nothing without a pattern, and keeps a status from Home Assistant', () => {
    const marked = { ...event('Canceled: x'), cancelled: true }
    expect(markCancelled([event('Canceled: x')], null)[0]?.cancelled).toBe(false)
    expect(markCancelled([marked], null)[0]?.cancelled).toBe(true)
  })
})
