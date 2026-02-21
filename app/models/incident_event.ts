import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import TechStream from '#models/tech_stream'

export default class IncidentEvent extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare eventType: 'alarm_triggered' | 'alarm_resolved' | 'incident_opened' | 'incident_resolved'

  @column()
  declare incidentId: string

  @column()
  declare serviceName: string

  @column()
  declare severity: 'critical' | 'high' | 'medium' | 'low' | null

  @column()
  declare description: string | null

  @column()
  declare techStreamId: number

  @column()
  declare relatedDeployId: number | null

  @column.dateTime()
  declare resolvedAt: DateTime | null

  @column()
  declare timeToRestoreMin: number | null

  @column.dateTime()
  declare occurredAt: DateTime

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @belongsTo(() => TechStream)
  declare techStream: BelongsTo<typeof TechStream>
}
