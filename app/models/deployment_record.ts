import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import TechStream from '#models/tech_stream'
import DeliveryStream from '#models/delivery_stream'
import Repository from '#models/repository'

export default class DeploymentRecord extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare techStreamId: number

  @column()
  declare deliveryStreamId: number | null

  @column()
  declare repoId: number | null

  @column()
  declare environment: string

  @column()
  declare status: 'success' | 'failed' | 'rolled_back' | 'cancelled'

  @column()
  declare commitSha: string | null

  @column()
  declare pipelineId: string | null

  @column()
  declare triggerType: string | null

  @column()
  declare linkedPrNumber: number | null

  @column()
  declare linkedTicketId: string | null

  @column()
  declare leadTimeHrs: number | null

  @column()
  declare causedIncident: boolean

  @column()
  declare incidentId: string | null

  @column.dateTime()
  declare deployedAt: DateTime

  @column.dateTime()
  declare rollbackAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @belongsTo(() => TechStream)
  declare techStream: BelongsTo<typeof TechStream>

  @belongsTo(() => DeliveryStream)
  declare deliveryStream: BelongsTo<typeof DeliveryStream>

  @belongsTo(() => Repository)
  declare repository: BelongsTo<typeof Repository>
}
