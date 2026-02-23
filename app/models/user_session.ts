import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'

export default class UserSession extends BaseModel {
  static table = 'user_sessions'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare authMethod: 'oidc' | 'database'

  @column()
  declare platformToken: string

  @column.dateTime()
  declare expiresAt: DateTime

  @column.dateTime()
  declare lastActivityAt: DateTime | null

  @column()
  declare isRevoked: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  get isExpired(): boolean {
    return this.expiresAt.toMillis() <= DateTime.now().toMillis()
  }

  get isActive(): boolean {
    return !this.isRevoked && !this.isExpired
  }
}
