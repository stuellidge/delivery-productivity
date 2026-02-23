import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class PublicHoliday extends BaseModel {
  static table = 'public_holidays'

  @column({ isPrimary: true })
  declare id: number

  /**
   * ISO 8601 date string: 'YYYY-MM-DD'
   * Stored as DATE in the database. pg driver returns a JS Date object;
   * we store it as a string for easy comparison.
   */
  @column({
    consume: (v) =>
      v instanceof Date ? v.toISOString().substring(0, 10) : String(v).substring(0, 10),
  })
  declare date: string

  @column()
  declare name: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
