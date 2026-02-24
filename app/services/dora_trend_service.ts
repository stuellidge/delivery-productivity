import { DateTime } from 'luxon'
import DeploymentRecord from '#models/deployment_record'
import IncidentEvent from '#models/incident_event'
import DailyStreamMetric from '#models/daily_stream_metric'

export interface DoraTrendPoint {
  weekStart: string
  deploymentFrequency: number
  changeFailureRate: number
  ttrMedian: number
  leadTimeP50: number | null
  leadTimeP85: number | null
}

const MATERIALIZED_METRIC_NAMES = [
  'deployment_frequency',
  'change_failure_rate',
  'ttr_median',
  'lead_time_p50',
  'lead_time_p85',
]

export default class DoraTrendService {
  constructor(
    private readonly techStreamId: number,
    private readonly windowDays: number = 90
  ) {}

  /**
   * Returns a time-series of DORA trend points.
   *
   * Priority: reads from the materialised `daily_stream_metrics` table (daily
   * granularity) when data is available. Falls back to computing weekly buckets
   * directly from raw event tables when the table has not yet been populated.
   */
  async compute(): Promise<DoraTrendPoint[]> {
    const materialized = await this.computeFromMaterialized()
    if (materialized.length > 0) return materialized
    return this.computeFromRaw()
  }

  // ─── Materialized path ────────────────────────────────────────────────────

  private async computeFromMaterialized(): Promise<DoraTrendPoint[]> {
    const windowStart = DateTime.now().minus({ days: this.windowDays })

    const rows = await DailyStreamMetric.query()
      .where('stream_type', 'tech')
      .where('stream_id', this.techStreamId)
      .whereIn('metric_name', MATERIALIZED_METRIC_NAMES)
      .where('metric_date', '>=', windowStart.toISODate()!)
      .orderBy('metric_date', 'asc')

    if (rows.length === 0) return []

    // Pivot: group metric rows by date into DoraTrendPoint objects
    const byDate = new Map<string, DoraTrendPoint>()

    for (const row of rows) {
      const date = row.metricDate
      if (!byDate.has(date)) {
        byDate.set(date, {
          weekStart: date,
          deploymentFrequency: 0,
          changeFailureRate: 0,
          ttrMedian: 0,
          leadTimeP50: null,
          leadTimeP85: null,
        })
      }

      const point = byDate.get(date)!
      const value = Number(row.metricValue)

      switch (row.metricName) {
        case 'deployment_frequency':
          point.deploymentFrequency = value
          break
        case 'change_failure_rate':
          point.changeFailureRate = value
          break
        case 'ttr_median':
          point.ttrMedian = value
          break
        case 'lead_time_p50':
          point.leadTimeP50 = value
          break
        case 'lead_time_p85':
          point.leadTimeP85 = value
          break
      }
    }

    return Array.from(byDate.values())
  }

  // ─── Raw computation path (fallback) ─────────────────────────────────────

  private async computeFromRaw(): Promise<DoraTrendPoint[]> {
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
      .where((q) => {
        q.whereNull('repo_id').orWhereRaw(
          'EXISTS (SELECT 1 FROM repositories WHERE repositories.id = deployment_records.repo_id AND repositories.is_deployable = true)'
        )
      })
      .where((q) => q.whereNull('trigger_type').orWhereNot('trigger_type', 'config'))

    const deploymentFrequency = deploys.length
    const failedDeploys = deploys.filter((d) => d.causedIncident).length
    const changeFailureRate = deploys.length > 0 ? (failedDeploys / deploys.length) * 100 : 0

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
