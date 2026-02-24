import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export type EventSource = 'jira' | 'github' | 'deployment' | 'incident'
export type QueueStatus = 'pending' | 'processing' | 'completed' | 'dead_lettered'

export default class EventQueue extends BaseModel {
  static table = 'event_queue'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare eventSource: EventSource

  @column()
  declare eventType: string | null

  @column()
  declare signature: string | null

  @column({
    prepare: (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v)),
    consume: (v: unknown) => {
      if (typeof v === 'string') {
        try {
          return JSON.parse(v)
        } catch {
          return v
        }
      }
      return v
    },
  })
  declare payload: Record<string, unknown>

  @column()
  declare status: QueueStatus

  @column()
  declare attemptCount: number

  @column()
  declare lastError: string | null

  @column.dateTime()
  declare enqueuedAt: DateTime

  @column.dateTime()
  declare processedAt: DateTime | null
}
