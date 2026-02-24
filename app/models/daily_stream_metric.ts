import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export type StreamType = 'delivery' | 'tech'

export default class DailyStreamMetric extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column({
    consume: (v) =>
      v instanceof Date ? v.toISOString().substring(0, 10) : String(v).substring(0, 10),
  })
  declare metricDate: string

  @column()
  declare streamType: StreamType

  @column()
  declare streamId: number

  @column()
  declare metricName: string

  @column()
  declare metricValue: number

  @column()
  declare metricUnit: string

  @column()
  declare percentile: number | null

  @column()
  declare sampleSize: number

  @column.dateTime({ autoCreate: true })
  declare computedAt: DateTime
}
