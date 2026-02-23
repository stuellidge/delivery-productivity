import { DateTime } from 'luxon'
import PublicHoliday from '#models/public_holiday'

export default class BusinessDayService {
  /**
   * Count the number of business days (excluding weekends and provided holidays)
   * between two DateTime values.
   *
   * Fractional days are preserved: e.g. from Fri 12:00 to Mon 12:00 = 1.0 business day.
   *
   * @param from     start DateTime (inclusive)
   * @param to       end DateTime (exclusive end — duration)
   * @param holidays array of 'YYYY-MM-DD' strings to exclude (optional)
   */
  static countBusinessDays(from: DateTime, to: DateTime, holidays: string[] = []): number {
    if (to.toMillis() <= from.toMillis()) return 0

    const holidaySet = new Set(holidays)
    const msPerDay = 24 * 60 * 60 * 1000

    let totalMs = 0
    let cursor = from

    while (cursor.toMillis() < to.toMillis()) {
      const dayStart = cursor.startOf('day')
      const dayIso = dayStart.toISODate()!
      const dow = cursor.weekday // 1=Mon … 7=Sun

      // Skip weekends and holidays
      if (dow < 6 && !holidaySet.has(dayIso)) {
        const dayEnd = dayStart.plus({ days: 1 })
        const segmentStart = cursor
        const segmentEnd = to.toMillis() < dayEnd.toMillis() ? to : dayEnd
        totalMs += segmentEnd.toMillis() - segmentStart.toMillis()
      }

      // Advance cursor to start of next calendar day
      cursor = dayStart.plus({ days: 1 })
    }

    return totalMs / msPerDay
  }

  /**
   * Load holiday date strings from the database and compute business days.
   */
  static async countBusinessDaysWithDbHolidays(from: DateTime, to: DateTime): Promise<number> {
    const rows = await PublicHoliday.query().select('date').orderBy('date')
    const holidays = rows.map((r) => r.date)
    return BusinessDayService.countBusinessDays(from, to, holidays)
  }
}
