import { DateTime } from 'luxon'
import hash from '@adonisjs/core/services/hash'
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import UserRole from '#models/user_role'
import type { RoleName } from '#models/user_role'

const AuthFinder = withAuthFinder(() => hash.use('scrypt'), {
  uids: ['email'],
  passwordColumnName: 'password',
})

export default class User extends compose(BaseModel, AuthFinder) {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare fullName: string | null

  @column()
  declare email: string

  @column({ serializeAs: null })
  declare password: string

  @column()
  declare isActive: boolean

  @column.dateTime()
  declare lastLoginAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @hasMany(() => UserRole)
  declare roles: HasMany<typeof UserRole>

  /**
   * Check if the user has a specific role (optionally scoped to a stream)
   */
  async hasRole(
    roleName: RoleName,
    options?: { deliveryStreamId?: number; techStreamId?: number }
  ): Promise<boolean> {
    const roles = await UserRole.query().where('user_id', this.id)
    return roles.some((role) => {
      if (role.role !== roleName) return false
      if (options?.deliveryStreamId && role.deliveryStreamId !== null) {
        return role.deliveryStreamId === options.deliveryStreamId
      }
      if (options?.techStreamId && role.techStreamId !== null) {
        return role.techStreamId === options.techStreamId
      }
      return true
    })
  }

  /**
   * Check if the user is a platform admin
   */
  async isAdmin(): Promise<boolean> {
    return this.hasRole('platform_admin')
  }
}
