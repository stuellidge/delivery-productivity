import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import Repository from '#models/repository'

export default class TechStream extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare name: string

  @column()
  declare displayName: string

  @column()
  declare githubOrg: string

  @column()
  declare githubInstallId: string

  @column()
  declare description: string | null

  @column()
  declare isActive: boolean

  @column()
  declare minContributors: number

  @column()
  declare ticketRegex: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @hasMany(() => Repository)
  declare repositories: HasMany<typeof Repository>
}
