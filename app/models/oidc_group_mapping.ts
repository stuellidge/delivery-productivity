import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import type { RoleName } from '#models/user_role'

export default class OidcGroupMapping extends BaseModel {
  static table = 'oidc_group_mappings'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare provider: string

  @column()
  declare groupPattern: string

  @column()
  declare isRegex: boolean

  @column()
  declare role: RoleName

  @column()
  declare deliveryStreamId: number | null

  @column()
  declare techStreamId: number | null

  @column()
  declare createdBy: number | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @belongsTo(() => User, { foreignKey: 'createdBy' })
  declare creator: BelongsTo<typeof User>
}
