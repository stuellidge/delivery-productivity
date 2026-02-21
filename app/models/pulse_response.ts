import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import DeliveryStream from '#models/delivery_stream'
import TechStream from '#models/tech_stream'

export default class PulseResponse extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare source: string

  @column()
  declare deliveryStreamId: number | null

  @column()
  declare techStreamId: number | null

  @column.dateTime()
  declare receivedAt: DateTime

  @column.dateTime()
  declare eventTimestamp: DateTime

  @column()
  declare surveyPeriod: string

  @column()
  declare respondentHash: string

  @column()
  declare paceScore: number

  @column()
  declare toolingScore: number

  @column()
  declare clarityScore: number

  @column()
  declare freeText: string | null

  @belongsTo(() => DeliveryStream)
  declare deliveryStream: BelongsTo<typeof DeliveryStream>

  @belongsTo(() => TechStream)
  declare techStream: BelongsTo<typeof TechStream>
}
