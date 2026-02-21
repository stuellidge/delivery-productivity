import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'
import DeliveryStream from '#models/delivery_stream'
import TechStream from '#models/tech_stream'

export type RoleName = 'viewer' | 'team_member' | 'stream_lead' | 'platform_admin'

export default class UserRole extends BaseModel {
  static table = 'user_roles'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare role: RoleName

  @column()
  declare deliveryStreamId: number | null

  @column()
  declare techStreamId: number | null

  @column()
  declare grantedBy: number | null

  @column.dateTime()
  declare grantedAt: DateTime

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @belongsTo(() => DeliveryStream)
  declare deliveryStream: BelongsTo<typeof DeliveryStream>

  @belongsTo(() => TechStream)
  declare techStream: BelongsTo<typeof TechStream>
}
