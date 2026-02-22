import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import TechStream from '#models/tech_stream'

export default class CrossStreamCorrelation extends BaseModel {
  static table = 'cross_stream_correlations'

  @column({ isPrimary: true })
  declare id: number

  @column({
    consume: (v: Date | string | null) => {
      if (!v) return null
      if (v instanceof Date) return v.toISOString().substring(0, 10)
      return String(v).substring(0, 10)
    },
  })
  declare analysisDate: string // DATE as string 'YYYY-MM-DD'

  @column()
  declare techStreamId: number

  @column({
    prepare: (v: number[]) => v,
    consume: (v: number[] | null) => v ?? [],
  })
  declare impactedDeliveryStreams: number[]

  @column({
    prepare: (v: number[]) => v,
    consume: (v: number[] | null) => v ?? [],
  })
  declare blockedDeliveryStreams: number[]

  @column({ columnName: 'block_count_14d' })
  declare blockCount14d: number

  @column({ columnName: 'avg_confidence_pct' })
  declare avgConfidencePct: number | null

  @column({ columnName: 'avg_cycle_time_p85' })
  declare avgCycleTimeP85: number | null

  @column()
  declare severity: string

  @column.dateTime()
  declare computedAt: DateTime

  @belongsTo(() => TechStream)
  declare techStream: BelongsTo<typeof TechStream>
}
