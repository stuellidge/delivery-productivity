import { DateTime } from 'luxon'
import Sprint from '#models/sprint'
import SprintSnapshot from '#models/sprint_snapshot'
import WorkItemCycle from '#models/work_item_cycle'

export interface SprintConfidenceResult {
  confidence: number
  sprintId: number | null
  sprintName: string | null
  remainingCount: number
  workingDaysRemaining: number
  hasInsufficientData: boolean
}

const SIMULATION_RUNS = 1000
const THROUGHPUT_WINDOW_WEEKS = 12

export default class SprintConfidenceService {
  constructor(private readonly deliveryStreamId: number) {}

  async compute(): Promise<SprintConfidenceResult> {
    const sprint = await Sprint.query()
      .where('state', 'active')
      .where('delivery_stream_id', this.deliveryStreamId)
      .first()

    if (!sprint) {
      return {
        confidence: 0,
        sprintId: null,
        sprintName: null,
        remainingCount: 0,
        workingDaysRemaining: 0,
        hasInsufficientData: true,
      }
    }

    const snapshot = await SprintSnapshot.query()
      .where('sprint_id', sprint.id)
      .orderBy('snapshot_date', 'desc')
      .first()

    const remainingCount = snapshot?.remainingCount ?? 0
    // sprint.endDate is a DATE column — pg driver returns a JS Date object at runtime
    const endDateRaw = sprint.endDate as unknown as Date | string
    const endDateDt =
      endDateRaw instanceof Date
        ? DateTime.fromJSDate(endDateRaw).toUTC()
        : DateTime.fromISO(endDateRaw)
    const workingDaysRemaining = this.countWorkingDays(DateTime.now(), endDateDt)

    const dailyThroughput = await this.getDailyThroughputSamples()

    if (dailyThroughput.length === 0) {
      return {
        confidence: 0,
        sprintId: sprint.id,
        sprintName: sprint.name,
        remainingCount,
        workingDaysRemaining,
        hasInsufficientData: true,
      }
    }

    const confidence = this.runSimulations(dailyThroughput, remainingCount, workingDaysRemaining)

    return {
      confidence,
      sprintId: sprint.id,
      sprintName: sprint.name,
      remainingCount,
      workingDaysRemaining,
      hasInsufficientData: false,
    }
  }

  private async getDailyThroughputSamples(): Promise<number[]> {
    const windowStart = DateTime.now().minus({ weeks: THROUGHPUT_WINDOW_WEEKS })

    const cycles = await WorkItemCycle.query()
      .where('delivery_stream_id', this.deliveryStreamId)
      .where('completed_at', '>=', windowStart.toSQL()!)
      .orderBy('completed_at', 'asc')

    if (cycles.length === 0) return []

    // Group by calendar day
    const byDay: Map<string, number> = new Map()
    for (const cycle of cycles) {
      const day = cycle.completedAt.toISODate()!
      byDay.set(day, (byDay.get(day) ?? 0) + 1)
    }

    return Array.from(byDay.values())
  }

  private runSimulations(
    dailySamples: number[],
    remainingCount: number,
    workingDaysRemaining: number
  ): number {
    const n = dailySamples.length
    let successCount = 0

    for (let sim = 0; sim < SIMULATION_RUNS; sim++) {
      let total = 0
      for (let d = 0; d < workingDaysRemaining; d++) {
        total += dailySamples[Math.floor(Math.random() * n)]
      }
      if (total >= remainingCount) successCount++
    }

    return (successCount / SIMULATION_RUNS) * 100
  }

  private countWorkingDays(from: DateTime, to: DateTime): number {
    let count = 0
    let current = from.startOf('day').plus({ days: 1 }) // start from tomorrow
    const end = to.startOf('day')
    while (current.toMillis() <= end.toMillis()) {
      const dow = current.weekday // 1=Mon, 7=Sun
      if (dow <= 5) count++
      current = current.plus({ days: 1 })
    }
    return count
  }
}
