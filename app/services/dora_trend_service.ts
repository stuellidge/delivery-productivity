import { DateTime } from 'luxon'
import DeploymentRecord from '#models/deployment_record'
import IncidentEvent from '#models/incident_event'

export interface DoraTrendPoint {
  weekStart: string
  deploymentFrequency: number
  changeFailureRate: number
  ttrMedian: number
  leadTimeP50: number | null
  leadTimeP85: number | null
}

export default class DoraTrendService {
  constructor(
    private readonly techStreamId: number,
    private readonly windowDays: number = 90
  ) {}

  async compute(): Promise<DoraTrendPoint[]> {
    const now = DateTime.now().startOf('day')
    const windowStart = now.minus({ days: this.windowDays })

    const buckets: Array<{ start: DateTime; end: DateTime }> = []
    let cursor = windowStart
    while (cursor.toMillis() < now.toMillis()) {
      const end = cursor.plus({ days: 7 })
      buckets.push({ start: cursor, end: end.toMillis() <= now.toMillis() ? end : now })
      cursor = cursor.plus({ days: 7 })
    }

    return Promise.all(buckets.map((b) => this.computeForBucket(b.start, b.end)))
  }

  private async computeForBucket(start: DateTime, end: DateTime): Promise<DoraTrendPoint> {
    const startSql = start.toSQL()!
    const endSql = end.toSQL()!

    const deploys = await DeploymentRecord.query()
      .where('tech_stream_id', this.techStreamId)
      .where('environment', 'production')
      .where('deployed_at', '>=', startSql)
      .where('deployed_at', '<', endSql)

    const deploymentFrequency = deploys.length
    const failedDeploys = deploys.filter((d) => d.causedIncident).length
    const changeFailureRate =
      deploys.length > 0 ? (failedDeploys / deploys.length) * 100 : 0

    const incidents = await IncidentEvent.query()
      .where('tech_stream_id', this.techStreamId)
      .where('occurred_at', '>=', startSql)
      .where('occurred_at', '<', endSql)
      .whereNotNull('time_to_restore_min')

    const ttrValues = incidents.map((i) => i.timeToRestoreMin!).sort((a, b) => a - b)
    const ttrMedian = this.percentile(ttrValues, 50)

    const leadTimes = deploys
      .filter((d) => d.leadTimeHrs !== null)
      .map((d) => Number(d.leadTimeHrs))
      .sort((a, b) => a - b)

    const leadTimeP50 = leadTimes.length > 0 ? this.percentile(leadTimes, 50) : null
    const leadTimeP85 = leadTimes.length > 0 ? this.percentile(leadTimes, 85) : null

    return {
      weekStart: start.toISODate()!,
      deploymentFrequency,
      changeFailureRate,
      ttrMedian,
      leadTimeP50,
      leadTimeP85,
    }
  }

  private percentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0
    const index = (p / 100) * (sortedValues.length - 1)
    const lower = Math.floor(index)
    const upper = Math.ceil(index)
    if (lower === upper) return sortedValues[lower]
    return sortedValues[lower] + (index - lower) * (sortedValues[upper] - sortedValues[lower])
  }
}
