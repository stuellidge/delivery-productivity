import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import TechStream from '#models/tech_stream'
import DeliveryStream from '#models/delivery_stream'
import Repository from '#models/repository'

export default class PrCycle extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare repoId: number

  @column()
  declare techStreamId: number

  @column()
  declare deliveryStreamId: number | null

  @column()
  declare prNumber: number

  @column()
  declare linkedTicketId: string | null

  @column()
  declare authorHash: string | null

  @column.dateTime()
  declare openedAt: DateTime

  @column.dateTime()
  declare firstReviewAt: DateTime | null

  @column.dateTime()
  declare approvedAt: DateTime | null

  @column.dateTime()
  declare mergedAt: DateTime | null

  @column()
  declare timeToFirstReviewHrs: number | null

  @column()
  declare timeToMergeHrs: number | null

  @column()
  declare reviewRounds: number | null

  @column()
  declare reviewerHashes: string[] | null

  @column()
  declare reviewerCount: number | null

  @column()
  declare linesChanged: number | null

  @column()
  declare filesChanged: number | null

  @belongsTo(() => TechStream)
  declare techStream: BelongsTo<typeof TechStream>

  @belongsTo(() => DeliveryStream)
  declare deliveryStream: BelongsTo<typeof DeliveryStream>

  @belongsTo(() => Repository)
  declare repository: BelongsTo<typeof Repository>
}
