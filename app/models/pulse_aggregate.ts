import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import DeliveryStream from '#models/delivery_stream'

export default class PulseAggregate extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare deliveryStreamId: number

  @column()
  declare surveyPeriod: string

  @column()
  declare responseCount: number

  @column()
  declare teamSize: number | null

  @column()
  declare responseRatePct: number | null

  @column()
  declare paceAvg: number | null

  @column()
  declare paceTrend: number | null

  @column()
  declare toolingAvg: number | null

  @column()
  declare toolingTrend: number | null

  @column()
  declare clarityAvg: number | null

  @column()
  declare clarityTrend: number | null

  @column()
  declare overallAvg: number | null

  @column.dateTime()
  declare computedAt: DateTime

  @belongsTo(() => DeliveryStream)
  declare deliveryStream: BelongsTo<typeof DeliveryStream>
}
