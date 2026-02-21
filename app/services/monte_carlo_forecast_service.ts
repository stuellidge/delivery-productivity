import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'

export interface ForecastResult {
  isLowConfidence: boolean
  weeksOfData: number
  remainingScope: number
  linearProjectionWeeks: number | null
  p50Date: string | null
  p70Date: string | null
  p85Date: string | null
  p95Date: string | null
  distributionData: { weekOffset: number; count: number }[]
  simulationRuns: number
}

const ACTIVE_STAGES = ['backlog', 'ba', 'dev', 'code_review', 'qa', 'uat']
const SIMULATION_RUNS = 10000
const LOW_CONFIDENCE_WEEKS_THRESHOLD = 6

export default class MonteCarloForecastService {
  constructor(
    private readonly deliveryStreamId: number,
    private readonly windowWeeks: number = 12
  ) {}

  async compute(): Promise<ForecastResult> {
    const remainingScope = await this.getRemainingScope()
    const weeklyThroughput = await this.getWeeklyThroughput()
    const weeksOfData = weeklyThroughput.length

    if (weeksOfData < LOW_CONFIDENCE_WEEKS_THRESHOLD) {
      const avgThroughput =
        weeksOfData > 0 ? weeklyThroughput.reduce((sum, v) => sum + v, 0) / weeksOfData : 0
      const linearProjectionWeeks =
        avgThroughput > 0 && remainingScope > 0 ? remainingScope / avgThroughput : null

      return {
        isLowConfidence: true,
        weeksOfData,
        remainingScope,
        linearProjectionWeeks,
        p50Date: null,
        p70Date: null,
        p85Date: null,
        p95Date: null,
        distributionData: [],
        simulationRuns: 0,
      }
    }

    // Run Monte Carlo simulations
    const completionWeeks = this.runSimulations(weeklyThroughput, remainingScope)
    completionWeeks.sort((a, b) => a - b)

    const p50 = this.percentileValue(completionWeeks, 50)
    const p70 = this.percentileValue(completionWeeks, 70)
    const p85 = this.percentileValue(completionWeeks, 85)
    const p95 = this.percentileValue(completionWeeks, 95)

    const today = DateTime.now()
    const distributionData = this.buildDistribution(completionWeeks)

    return {
      isLowConfidence: false,
      weeksOfData,
      remainingScope,
      linearProjectionWeeks: null,
      p50Date: today.plus({ weeks: p50 }).toISODate(),
      p70Date: today.plus({ weeks: p70 }).toISODate(),
      p85Date: today.plus({ weeks: p85 }).toISODate(),
      p95Date: today.plus({ weeks: p95 }).toISODate(),
      distributionData,
      simulationRuns: SIMULATION_RUNS,
    }
  }

  private async getRemainingScope(): Promise<number> {
    // Find the latest to_stage for each ticket in this delivery stream
    // A ticket is "active" if its most recent transition put it in an active stage
    const rows = await db
      .from('work_item_events as wie1')
      .where('wie1.delivery_stream_id', this.deliveryStreamId)
      .whereNotNull('wie1.to_stage')
      .whereIn('wie1.to_stage', ACTIVE_STAGES)
      .whereNotExists((q) => {
        q.from('work_item_events as wie2')
          .whereColumn('wie2.ticket_id', 'wie1.ticket_id')
          .where('wie2.delivery_stream_id', this.deliveryStreamId)
          .whereNotIn('wie2.to_stage', ACTIVE_STAGES)
          .whereNotNull('wie2.to_stage')
          .where('wie2.event_timestamp', '>', db.raw('wie1.event_timestamp'))
      })
      .countDistinct('wie1.ticket_id as count')

    return Number(rows[0].count)
  }

  private async getWeeklyThroughput(): Promise<number[]> {
    const windowStart = DateTime.now().minus({ weeks: this.windowWeeks })

    const rows = await db
      .from('work_item_cycles')
      .where('delivery_stream_id', this.deliveryStreamId)
      .where('completed_at', '>=', windowStart.toSQL()!)
      .select(db.raw(`DATE_TRUNC('week', completed_at) as week_start`), db.raw('COUNT(*) as cnt'))
      .groupByRaw(`DATE_TRUNC('week', completed_at)`)
      .orderByRaw(`DATE_TRUNC('week', completed_at)`)

    return rows.map((r) => Number(r.cnt))
  }

  private runSimulations(weeklyThroughput: number[], remainingScope: number): number[] {
    const results: number[] = []
    const n = weeklyThroughput.length

    for (let sim = 0; sim < SIMULATION_RUNS; sim++) {
      let totalCompleted = 0
      let weeks = 0
      while (totalCompleted < remainingScope) {
        const sample = weeklyThroughput[Math.floor(Math.random() * n)]
        totalCompleted += sample
        weeks++
        // Guard against infinite loop (0 throughput weeks)
        if (weeks > 520) break
      }
      results.push(weeks)
    }

    return results
  }

  private percentileValue(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0
    const index = (p / 100) * (sorted.length - 1)
    const lower = Math.floor(index)
    const upper = Math.ceil(index)
    if (lower === upper) return sorted[lower]
    return sorted[lower] + (index - lower) * (sorted[upper] - sorted[lower])
  }

  private buildDistribution(sorted: number[]): { weekOffset: number; count: number }[] {
    const bins: Map<number, number> = new Map()
    for (const w of sorted) {
      const bucket = Math.round(w)
      bins.set(bucket, (bins.get(bucket) ?? 0) + 1)
    }
    return Array.from(bins.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([weekOffset, count]) => ({ weekOffset, count }))
  }
}
