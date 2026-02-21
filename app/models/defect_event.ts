import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import DeliveryStream from '#models/delivery_stream'
import TechStream from '#models/tech_stream'

export type DefectEventType = 'logged' | 'attributed' | 'reclassified'
export type DefectSeverity = 'critical' | 'high' | 'medium' | 'low'

export default class DefectEvent extends BaseModel {
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
  declare eventType: DefectEventType

  @column()
  declare ticketId: string

  @column()
  declare severity: DefectSeverity | null

  @column()
  declare foundInStage: string

  @column()
  declare introducedInStage: string | null

  @column()
  declare linkedWorkItemId: string | null

  @column()
  declare rootCauseCategory: string | null

  @belongsTo(() => DeliveryStream)
  declare deliveryStream: BelongsTo<typeof DeliveryStream>

  @belongsTo(() => TechStream)
  declare techStream: BelongsTo<typeof TechStream>
}
