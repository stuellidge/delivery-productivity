import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import DeliveryStream from '#models/delivery_stream'
import TechStream from '#models/tech_stream'
import Sprint from '#models/sprint'
import type { PipelineStage } from '#models/status_mapping'

export type WorkItemEventType =
  | 'created'
  | 'transitioned'
  | 'completed'
  | 'blocked'
  | 'unblocked'
  | 'flagged'
  | 'unflagged'

export default class WorkItemEvent extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  // Common event columns
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

  // Work item specific columns
  @column()
  declare eventType: WorkItemEventType

  @column()
  declare ticketId: string

  @column()
  declare ticketType: string | null

  @column()
  declare fromStage: PipelineStage | null

  @column()
  declare toStage: PipelineStage | null

  @column()
  declare assigneeHash: string | null

  @column()
  declare storyPoints: number | null

  @column()
  declare priority: string | null

  @column()
  declare sprintId: number | null

  @column()
  declare labels: string[] | null

  @column()
  declare blockedReason: string | null

  @column()
  declare blockingTechStreamId: number | null

  @belongsTo(() => DeliveryStream)
  declare deliveryStream: BelongsTo<typeof DeliveryStream>

  @belongsTo(() => TechStream)
  declare techStream: BelongsTo<typeof TechStream>

  @belongsTo(() => Sprint)
  declare sprint: BelongsTo<typeof Sprint>
}
