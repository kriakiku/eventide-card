import { describe, expect, test } from 'bun:test'

import { addDays, dayKeyOf, parseDayKey, startOfDayMs, weekdayOf } from './timezone.ts'

const u = Date.UTC

describe('dayKeyOf', () => {
  test.each([
    [u(2026, 2, 28, 21, 59, 59), 'Europe/Kyiv', '2026-03-28'],
    [u(2026, 2, 28, 22, 0, 0), 'Europe/Kyiv', '2026-03-29'],
    [u(2026, 0, 1, 4, 59, 59), 'America/New_York', '2025-12-31'],
    [u(2026, 0, 1, 5, 0, 0), 'America/New_York', '2026-01-01'],
    [u(2026, 0, 1, 18, 14, 59), 'Asia/Kathmandu', '2026-01-01'],
    [u(2026, 0, 1, 18, 15, 0), 'Asia/Kathmandu', '2026-01-02'],
    [u(2026, 0, 1, 12, 59, 59), 'Australia/Lord_Howe', '2026-01-01'],
    [u(2026, 0, 1, 13, 0, 0), 'Australia/Lord_Howe', '2026-01-02'],
    [u(2026, 5, 30, 13, 29, 59), 'Australia/Lord_Howe', '2026-06-30'],
    [u(2026, 5, 30, 13, 30, 0), 'Australia/Lord_Howe', '2026-07-01'],
    [u(2026, 2, 8, 4, 59, 59), 'America/Havana', '2026-03-07'],
    [u(2026, 2, 8, 5, 0, 0), 'America/Havana', '2026-03-08'],
    [u(2024, 1, 29, 23, 59, 59), 'UTC', '2024-02-29'],
    [u(2024, 2, 1, 0, 0, 0), 'UTC', '2024-03-01'],
  ])('%d in %s is %s', (ms, zone, expected) => {
    expect(dayKeyOf(ms, zone)).toBe(expected)
  })

  test('handles sub-second instants right before midnight', () => {
    expect(dayKeyOf(u(2026, 0, 1) - 1, 'UTC')).toBe('2025-12-31')
    expect(dayKeyOf(-1, 'UTC')).toBe('1969-12-31')
  })
})

describe('startOfDayMs', () => {
  test.each([
    ['2026-01-15', 'UTC', u(2026, 0, 15)],
    ['2026-01-15', 'Europe/Kyiv', u(2026, 0, 14, 22)],
    ['2026-07-15', 'Europe/Kyiv', u(2026, 6, 14, 21)],
    ['2026-03-29', 'Europe/Kyiv', u(2026, 2, 28, 22)],
    ['2026-03-30', 'Europe/Kyiv', u(2026, 2, 29, 21)],
    ['2026-10-25', 'Europe/Kyiv', u(2026, 9, 24, 21)],
    ['2026-10-26', 'Europe/Kyiv', u(2026, 9, 25, 22)],
    ['2026-03-08', 'America/New_York', u(2026, 2, 8, 5)],
    ['2026-03-09', 'America/New_York', u(2026, 2, 9, 4)],
    ['2026-11-01', 'America/New_York', u(2026, 10, 1, 4)],
    ['2026-11-02', 'America/New_York', u(2026, 10, 2, 5)],
    ['2026-01-15', 'Asia/Kathmandu', u(2026, 0, 14, 18, 15)],
    ['2026-04-05', 'Australia/Lord_Howe', u(2026, 3, 4, 13)],
    ['2026-04-06', 'Australia/Lord_Howe', u(2026, 3, 5, 13, 30)],
    ['2026-10-04', 'Australia/Lord_Howe', u(2026, 9, 3, 13, 30)],
    ['2026-10-05', 'Australia/Lord_Howe', u(2026, 9, 4, 13)],
  ])('%s in %s', (day, zone, expected) => {
    expect(startOfDayMs(day, zone)).toBe(expected)
  })

  test.each([
    ['2026-03-08', 'America/Havana', u(2026, 2, 8, 5)],
    ['2026-03-29', 'Asia/Beirut', u(2026, 2, 28, 22)],
  ])('midnight missing on %s in %s resolves to the first instant of the day', (day, zone, ms) => {
    expect(startOfDayMs(day, zone)).toBe(ms)
    expect(dayKeyOf(ms, zone)).toBe(day)
    expect(dayKeyOf(ms - 1, zone)).toBe(addDays(day, -1))
  })

  test('repeated midnight on a fall-back day resolves to the first occurrence', () => {
    expect(startOfDayMs('2026-11-01', 'America/Havana')).toBe(u(2026, 10, 1, 4))
    expect(startOfDayMs('2026-11-02', 'America/Havana')).toBe(u(2026, 10, 2, 5))
  })

  test('fall-back across midnight lands on the real midnight', () => {
    const ms = startOfDayMs('2026-10-25', 'Asia/Beirut')
    expect(ms).toBe(u(2026, 9, 24, 22))
    expect(dayKeyOf(ms, 'Asia/Beirut')).toBe('2026-10-25')
    expect(dayKeyOf(ms - 1, 'Asia/Beirut')).toBe('2026-10-24')
  })

  test('a calendar day skipped by the zone resolves to the transition', () => {
    expect(startOfDayMs('2011-12-30', 'Pacific/Apia')).toBe(u(2011, 11, 30, 10))
    expect(dayKeyOf(u(2011, 11, 30, 10), 'Pacific/Apia')).toBe('2011-12-31')
  })

  test.each([
    'UTC',
    'Europe/Kyiv',
    'America/New_York',
    'Asia/Kathmandu',
    'America/Havana',
    'Asia/Beirut',
    'Australia/Lord_Howe',
  ])('every day of 2026 starts exactly on its boundary in %s', (zone) => {
    for (let key = '2026-01-01'; key < '2027-01-01'; key = addDays(key, 1)) {
      const start = startOfDayMs(key, zone)
      const next = startOfDayMs(addDays(key, 1), zone)
      expect(dayKeyOf(start, zone)).toBe(key)
      expect(dayKeyOf(start - 1, zone)).toBe(addDays(key, -1))
      expect(next - start).toBeGreaterThanOrEqual(23 * 3_600_000)
      expect(next - start).toBeLessThanOrEqual(25 * 3_600_000)
    }
  })

  test('rejects an invalid day key', () => {
    expect(() => startOfDayMs('2026-02-30', 'UTC')).toThrow(RangeError)
  })
})

describe('addDays', () => {
  test.each([
    ['2026-01-31', 1, '2026-02-01'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2027-01-01', -1, '2026-12-31'],
    ['2024-02-28', 1, '2024-02-29'],
    ['2025-02-28', 1, '2025-03-01'],
    ['2026-03-28', 2, '2026-03-30'],
    ['2026-06-15', 0, '2026-06-15'],
    ['2026-01-01', 365, '2027-01-01'],
  ])('%s %d', (day, delta, expected) => {
    expect(addDays(day, delta)).toBe(expected)
  })

  test('rejects an invalid day key', () => {
    expect(() => addDays('nope', 1)).toThrow(RangeError)
  })
})

describe('day key helpers', () => {
  test.each([
    ['2026-02-28', true],
    ['2024-02-29', true],
    ['2025-02-29', false],
    ['2026-13-01', false],
    ['2026-1-1', false],
    ['0000-01-01', false],
    ['', false],
  ])('parseDayKey %s', (key, valid) => {
    expect(parseDayKey(key) !== null).toBe(valid)
  })

  test.each([
    ['2026-11-08', 0],
    ['2026-11-09', 1],
    ['2026-11-14', 6],
  ])('weekdayOf %s', (key, weekday) => {
    expect(weekdayOf(key)).toBe(weekday)
  })
})
