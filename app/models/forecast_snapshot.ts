import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import DeliveryStream from '#models/delivery_stream'

const consumeDate = (v: Date | string | null): string | null => {
  if (!v) return null
  if (v instanceof Date) return v.toISOString().substring(0, 10)
  return String(v).substring(0, 10)
}

export default class ForecastSnapshot extends BaseModel {
  static table = 'forecast_snapshots'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare deliveryStreamId: number

  @column({ consume: consumeDate })
  declare forecastDate: string

  @column()
  declare scopeItemCount: number

  @column()
  declare throughputSamples: number

  @column()
  declare simulationRuns: number

  @column({ columnName: 'p50_completion_date', consume: consumeDate })
  declare p50CompletionDate: string | null

  @column({ columnName: 'p70_completion_date', consume: consumeDate })
  declare p70CompletionDate: string | null

  @column({ columnName: 'p85_completion_date', consume: consumeDate })
  declare p85CompletionDate: string | null

  @column({ columnName: 'p95_completion_date', consume: consumeDate })
  declare p95CompletionDate: string | null

  @column({
    prepare: (v: unknown) => (v === null || v === undefined ? null : JSON.stringify(v)),
    consume: (v: unknown) => {
      if (v === null || v === undefined) return null
      if (typeof v === 'string') {
        try {
          return JSON.parse(v)
        } catch {
          return null
        }
      }
      return v
    },
  })
  declare distributionData: { weekOffset: number; count: number }[] | null

  @column.dateTime()
  declare computedAt: DateTime

  @belongsTo(() => DeliveryStream)
  declare deliveryStream: BelongsTo<typeof DeliveryStream>
}
