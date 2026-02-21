import { BaseModel, column, belongsTo, hasMany } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import DeliveryStream from '#models/delivery_stream'
import SprintSnapshot from '#models/sprint_snapshot'

export type SprintState = 'future' | 'active' | 'closed'

export default class Sprint extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare jiraSprintId: string

  @column()
  declare deliveryStreamId: number | null

  @column()
  declare name: string

  @column()
  declare startDate: string

  @column()
  declare endDate: string

  @column()
  declare goal: string | null

  @column()
  declare state: SprintState

  @belongsTo(() => DeliveryStream)
  declare deliveryStream: BelongsTo<typeof DeliveryStream>

  @hasMany(() => SprintSnapshot)
  declare snapshots: HasMany<typeof SprintSnapshot>
}
