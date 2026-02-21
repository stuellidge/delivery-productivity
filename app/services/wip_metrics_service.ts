import db from '@adonisjs/lucid/services/db'
import type { PipelineStage } from '#models/status_mapping'

export type WipByStage = Partial<Record<PipelineStage, number>>

export default class WipMetricsService {
  async compute(deliveryStreamId?: number): Promise<WipByStage> {
    // Get the latest transition event per ticket, excluding completed tickets
    let query = db
      .from('work_item_events as latest')
      .select('latest.to_stage')
      .whereRaw(
        `latest.event_timestamp = (
          SELECT MAX(inner_e.event_timestamp)
          FROM work_item_events inner_e
          WHERE inner_e.ticket_id = latest.ticket_id
            AND inner_e.event_type = 'transitioned'
        )`
      )
      .where('latest.event_type', 'transitioned')
      .whereNotNull('latest.to_stage')
      .whereNotExists((subQuery) => {
        subQuery
          .from('work_item_events as completed_e')
          .whereRaw('completed_e.ticket_id = latest.ticket_id')
          .where('completed_e.event_type', 'completed')
      })
      .count('* as count')
      .groupBy('latest.to_stage')

    if (deliveryStreamId !== undefined) {
      query = query.where('latest.delivery_stream_id', deliveryStreamId)
    }

    const rows = await query

    const result: WipByStage = {}
    for (const row of rows) {
      const stage = row.to_stage as PipelineStage
      const count = Number(row.count)
      if (count > 0) {
        result[stage] = count
      }
    }

    return result
  }
}
