import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import WorkItemEvent from '#models/work_item_event'
import Sprint from '#models/sprint'

export default class DeliveryStream extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare name: string

  @column()
  declare displayName: string

  @column()
  declare description: string | null

  @column()
  declare isActive: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @hasMany(() => WorkItemEvent)
  declare workItemEvents: HasMany<typeof WorkItemEvent>

  @hasMany(() => Sprint)
  declare sprints: HasMany<typeof Sprint>
}
