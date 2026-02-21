import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import DeliveryStream from '#models/delivery_stream'
import Sprint from '#models/sprint'

export default class WorkItemCycle extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare ticketId: string

  @column()
  declare deliveryStreamId: number | null

  @column()
  declare techStreamIds: number[] | null

  @column()
  declare ticketType: string | null

  @column()
  declare storyPoints: number | null

  @column.dateTime({ columnName: 'created_at_source' })
  declare createdAtSource: DateTime

  @column.dateTime()
  declare firstInProgress: DateTime | null

  @column.dateTime()
  declare completedAt: DateTime

  @column()
  declare leadTimeDays: number

  @column()
  declare cycleTimeDays: number

  @column()
  declare activeTimeDays: number

  @column()
  declare waitTimeDays: number

  @column()
  declare flowEfficiencyPct: number

  @column()
  declare stageDurations: Record<string, number>

  @column()
  declare sprintId: number | null

  @belongsTo(() => DeliveryStream)
  declare deliveryStream: BelongsTo<typeof DeliveryStream>

  @belongsTo(() => Sprint)
  declare sprint: BelongsTo<typeof Sprint>
}
