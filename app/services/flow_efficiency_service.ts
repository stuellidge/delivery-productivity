import WorkItemCycle from '#models/work_item_cycle'
import { DateTime } from 'luxon'

export interface FlowEfficiencyResult {
  count: number
  avgFlowEfficiencyPct: number | null
  avgStageDurations: Record<string, number>
}

export default class FlowEfficiencyService {
  async compute(deliveryStreamId?: number, windowDays: number = 30): Promise<FlowEfficiencyResult> {
    const windowStart = DateTime.now().minus({ days: windowDays })

    let query = WorkItemCycle.query().where('completed_at', '>=', windowStart.toSQL()!)

    if (deliveryStreamId !== undefined) {
      query = query.where('delivery_stream_id', deliveryStreamId)
    }

    const cycles = await query

    if (cycles.length === 0) {
      return { count: 0, avgFlowEfficiencyPct: null, avgStageDurations: {} }
    }

    const totalEfficiency = cycles.reduce((sum, c) => sum + Number(c.flowEfficiencyPct), 0)
    const avgFlowEfficiencyPct = totalEfficiency / cycles.length

    const stageSums: Record<string, { total: number; count: number }> = {}
    for (const cycle of cycles) {
      for (const [stage, duration] of Object.entries(cycle.stageDurations)) {
        if (!stageSums[stage]) {
          stageSums[stage] = { total: 0, count: 0 }
        }
        stageSums[stage].total += Number(duration)
        stageSums[stage].count += 1
      }
    }

    const avgStageDurations: Record<string, number> = {}
    for (const [stage, { total, count }] of Object.entries(stageSums)) {
      avgStageDurations[stage] = total / count
    }

    return { count: cycles.length, avgFlowEfficiencyPct, avgStageDurations }
  }
}
