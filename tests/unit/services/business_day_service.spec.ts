import { test } from '@japa/runner'
import { DateTime } from 'luxon'
import BusinessDayService from '#services/business_day_service'

// Fixed reference dates (all at UTC midnight)
// 2026-01-01 = Thursday
// 2026-01-02 = Friday
// 2026-01-03 = Saturday
// 2026-01-04 = Sunday
// 2026-01-05 = Monday
// 2026-01-06 = Tuesday
// 2026-01-07 = Wednesday
// 2026-01-09 = Friday
// 2026-01-12 = Monday

const d = (iso: string) => DateTime.fromISO(iso, { zone: 'utc' })

test.group('BusinessDayService.countBusinessDays', () => {
  test('same timestamp returns 0', ({ assert }) => {
    const result = BusinessDayService.countBusinessDays(d('2026-01-05'), d('2026-01-05'))
    assert.approximately(result, 0, 0.001)
  })

  test('Thu 00:00 → Wed 00:00 across one weekend = 4 elapsed business days', ({ assert }) => {
    // Jan 1 (Thu) 00:00 → Jan 7 (Wed) 00:00
    // Elapsed business time: Thu(1) + Fri(1) + Sat/Sun(skip) + Mon(1) + Tue(1) = 4 days
    // Jan 7 itself is not counted (the range ends at the START of Jan 7)
    const result = BusinessDayService.countBusinessDays(d('2026-01-01'), d('2026-01-07'))
    assert.approximately(result, 4, 0.001)
  })

  test('Fri 00:00 → Wed 00:00 across one weekend = 3 elapsed business days', ({ assert }) => {
    // Jan 2 (Fri) 00:00 → Jan 7 (Wed) 00:00
    // Fri(1) + Sat/Sun(skip) + Mon(1) + Tue(1) = 3 days
    const result = BusinessDayService.countBusinessDays(d('2026-01-02'), d('2026-01-07'))
    assert.approximately(result, 3, 0.001)
  })

  test('Sun 00:00 → Wed 00:00 = 2 elapsed business days (Mon, Tue only)', ({ assert }) => {
    // Jan 4 (Sun) 00:00 → Jan 7 (Wed) 00:00
    // Sun(skip) + Mon(1) + Tue(1) = 2 days
    const result = BusinessDayService.countBusinessDays(d('2026-01-04'), d('2026-01-07'))
    assert.approximately(result, 2, 0.001)
  })

  test('Mon 00:00 → Mon 00:00 next week = 5 elapsed business days', ({ assert }) => {
    // Jan 5 (Mon) 00:00 → Jan 12 (Mon) 00:00
    // Mon(1) + Tue(1) + Wed(1) + Thu(1) + Fri(1) = 5 days
    const result = BusinessDayService.countBusinessDays(d('2026-01-05'), d('2026-01-12'))
    assert.approximately(result, 5, 0.001)
  })

  test('fractional day within a single working day', ({ assert }) => {
    // Mon 09:00 → Mon 18:00 = 9h business time = 9/24 = 0.375 days
    const from = DateTime.fromISO('2026-01-05T09:00:00', { zone: 'utc' })
    const to = DateTime.fromISO('2026-01-05T18:00:00', { zone: 'utc' })
    const result = BusinessDayService.countBusinessDays(from, to)
    assert.approximately(result, 0.375, 0.001)
  })

  test('Fri noon → Mon noon = 1 elapsed business day (weekend fully excluded)', ({ assert }) => {
    // Fri 12:00 → Mon 12:00
    // Fri afternoon (12h) + Mon morning (12h) = 24h = 1 business day
    const from = DateTime.fromISO('2026-01-02T12:00:00', { zone: 'utc' })
    const to = DateTime.fromISO('2026-01-05T12:00:00', { zone: 'utc' })
    const result = BusinessDayService.countBusinessDays(from, to)
    assert.approximately(result, 1.0, 0.001)
  })

  test('excludes a configured holiday date', ({ assert }) => {
    // Jan 1 (Thu) → Jan 7 (Wed) = 4 business days normally
    // Jan 5 (Mon) is a holiday → 3 business days
    const holidays = ['2026-01-05']
    const result = BusinessDayService.countBusinessDays(d('2026-01-01'), d('2026-01-07'), holidays)
    assert.approximately(result, 3, 0.001)
  })

  test('excludes multiple holiday dates', ({ assert }) => {
    // Jan 1 (Thu) → Jan 7 (Wed) = 4 business days normally
    // Jan 5 (Mon) and Jan 6 (Tue) are holidays → 2 business days
    const holidays = ['2026-01-05', '2026-01-06']
    const result = BusinessDayService.countBusinessDays(d('2026-01-01'), d('2026-01-07'), holidays)
    assert.approximately(result, 2, 0.001)
  })

  test('holiday on weekend has no effect', ({ assert }) => {
    // Jan 3 (Sat) — already excluded as weekend — marking it as holiday makes no difference
    const withHoliday = BusinessDayService.countBusinessDays(d('2026-01-01'), d('2026-01-07'), [
      '2026-01-03',
    ])
    const withoutHoliday = BusinessDayService.countBusinessDays(d('2026-01-01'), d('2026-01-07'))
    assert.approximately(withHoliday, withoutHoliday, 0.001)
  })
})
