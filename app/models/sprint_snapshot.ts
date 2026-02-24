import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Sprint from '#models/sprint'

export default class SprintSnapshot extends BaseModel {
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

  // Sprint snapshot specific columns
  @column()
  declare sprintId: number

  @column({
    consume: (v) => (v instanceof Date ? v.toISOString().substring(0, 10) : String(v).substring(0, 10)),
  })
  declare snapshotDate: string

  @column()
  declare committedCount: number

  @column()
  declare completedCount: number

  @column()
  declare remainingCount: number

  @column()
  declare addedAfterStart: number

  @column()
  declare removedAfterStart: number

  @column()
  declare wipBa: number

  @column()
  declare wipDev: number

  @column()
  declare wipQa: number

  @column()
  declare wipUat: number

  @belongsTo(() => Sprint)
  declare sprint: BelongsTo<typeof Sprint>
}
