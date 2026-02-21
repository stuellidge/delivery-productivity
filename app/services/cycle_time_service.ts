import WorkItemCycle from '#models/work_item_cycle'
import { DateTime } from 'luxon'

export interface CycleTimeResult {
  count: number
  p50: number
  p85: number
  p95: number
}

export default class CycleTimeService {
  async compute(deliveryStreamId?: number, windowDays: number = 30): Promise<CycleTimeResult> {
    const windowStart = DateTime.now().minus({ days: windowDays })

    let query = WorkItemCycle.query().where('completed_at', '>=', windowStart.toSQL()!)

    if (deliveryStreamId !== undefined) {
      query = query.where('delivery_stream_id', deliveryStreamId)
    }

    const cycles = await query.orderBy('cycle_time_days', 'asc')

    if (cycles.length === 0) {
      return { count: 0, p50: 0, p85: 0, p95: 0 }
    }

    const values = cycles.map((c) => Number(c.cycleTimeDays))

    return {
      count: values.length,
      p50: this.percentile(values, 50),
      p85: this.percentile(values, 85),
      p95: this.percentile(values, 95),
    }
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 1) return sorted[0]
    const idx = (p / 100) * (sorted.length - 1)
    const lower = Math.floor(idx)
    const upper = Math.ceil(idx)
    if (lower === upper) return sorted[lower]
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower)
  }
}
