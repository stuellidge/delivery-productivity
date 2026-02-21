import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import TechStream from '#models/tech_stream'
import DeliveryStream from '#models/delivery_stream'
import Repository from '#models/repository'

export type PrEventType =
  | 'opened'
  | 'review_submitted'
  | 'changes_requested'
  | 'approved'
  | 'merged'
  | 'closed'

export default class PrEvent extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare source: string

  @column()
  declare eventType: PrEventType

  @column()
  declare prNumber: number

  @column()
  declare repoId: number

  @column()
  declare githubOrg: string

  @column()
  declare githubRepo: string

  @column()
  declare authorHash: string | null

  @column()
  declare branchName: string | null

  @column()
  declare linkedTicketId: string | null

  @column()
  declare baseBranch: string | null

  @column()
  declare linesAdded: number | null

  @column()
  declare linesRemoved: number | null

  @column()
  declare filesChanged: number | null

  @column()
  declare reviewerHash: string | null

  @column()
  declare reviewState: string | null

  @column()
  declare commentsCount: number | null

  @column()
  declare techStreamId: number

  @column()
  declare deliveryStreamId: number | null

  @column.dateTime()
  declare eventTimestamp: DateTime

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @belongsTo(() => TechStream)
  declare techStream: BelongsTo<typeof TechStream>

  @belongsTo(() => DeliveryStream)
  declare deliveryStream: BelongsTo<typeof DeliveryStream>

  @belongsTo(() => Repository)
  declare repository: BelongsTo<typeof Repository>
}
