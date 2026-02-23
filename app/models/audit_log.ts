import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'

export default class AuditLog extends BaseModel {
  static table = 'audit_log'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare actorUserId: number | null

  @column()
  declare actorEmail: string

  @column()
  declare action: string

  @column()
  declare entityType: string | null

  @column()
  declare entityId: string | null

  @column({
    prepare: (v) => (v != null ? JSON.stringify(v) : null),
    consume: (v) => (typeof v === 'string' ? JSON.parse(v) : v),
  })
  declare detail: Record<string, any> | null

  @column()
  declare ipAddress: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @belongsTo(() => User, { foreignKey: 'actorUserId' })
  declare actor: BelongsTo<typeof User>
}
