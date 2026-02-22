import { BaseModel, column } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'

export default class PlatformSetting extends BaseModel {
  static table = 'platform_settings'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare key: string

  @column({
    prepare: (value: unknown) => (typeof value === 'string' ? value : JSON.stringify(value)),
    consume: (value: unknown) => {
      if (typeof value === 'string') {
        try {
          return JSON.parse(value)
        } catch {
          return value
        }
      }
      return value
    },
  })
  declare value: unknown

  @column()
  declare description: string | null

  @column.dateTime()
  declare updatedAt: DateTime

  @column()
  declare updatedBy: number | null

  /**
   * Fetch a setting by key, returning fallback if not found.
   */
  static async get<T>(key: string, fallback: T): Promise<T> {
    const setting = await PlatformSetting.findBy('key', key)
    if (!setting) return fallback
    return setting.value as T
  }
}
