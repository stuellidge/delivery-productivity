import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import TechStream from '#models/tech_stream'

export default class Repository extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare techStreamId: number

  @column()
  declare githubOrg: string

  @column()
  declare githubRepoName: string

  @column()
  declare fullName: string

  @column()
  declare defaultBranch: string

  @column()
  declare isDeployable: boolean

  @column()
  declare deployTarget: string | null

  @column()
  declare isActive: boolean

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => TechStream)
  declare techStream: BelongsTo<typeof TechStream>
}
