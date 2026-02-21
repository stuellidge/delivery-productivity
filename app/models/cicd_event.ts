import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import DeliveryStream from '#models/delivery_stream'
import TechStream from '#models/tech_stream'

export type CicdEventType =
  | 'build_started'
  | 'build_completed'
  | 'deploy_started'
  | 'deploy_completed'
  | 'deploy_failed'
  | 'rollback_initiated'
  | 'rollback_completed'

export default class CicdEvent extends BaseModel {
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
  declare eventType: CicdEventType

  @column()
  declare pipelineId: string

  @column()
  declare pipelineRunId: string

  @column()
  declare environment: string

  @column()
  declare status: string

  @column()
  declare durationSeconds: number | null

  @column()
  declare commitSha: string | null

  @column()
  declare linkedPrNumber: number | null

  @column()
  declare linkedTicketId: string | null

  @column()
  declare triggerType: string | null

  @column()
  declare artefactVersion: string | null

  @column()
  declare failureReason: string | null

  @belongsTo(() => DeliveryStream)
  declare deliveryStream: BelongsTo<typeof DeliveryStream>

  @belongsTo(() => TechStream)
  declare techStream: BelongsTo<typeof TechStream>
}
