import { DateTime } from 'luxon'
import DeploymentRecord from '#models/deployment_record'
import IncidentEvent from '#models/incident_event'

export interface DoraMetrics {
  deploymentFrequency: number
  changeFailureRate: number
  ttrMedian: number
  ttrMean: number
  leadTimeP50: number | null
  leadTimeP85: number | null
}

export default class DoraMetricsService {
  constructor(
    private readonly techStreamId: number,
    private readonly windowDays: number = 30
  ) {}

  async compute(): Promise<DoraMetrics> {
    const windowStart = DateTime.now().minus({ days: this.windowDays })

    // Production deployments in window
    const deploys = await DeploymentRecord.query()
      .where('tech_stream_id', this.techStreamId)
      .where('environment', 'production')
      .where('deployed_at', '>=', windowStart.toSQL()!)

    // Deployment frequency (deploys per week)
    const deploymentFrequency = deploys.length > 0 ? deploys.length / (this.windowDays / 7) : 0

    // Change failure rate (% of deploys that caused incidents)
    const failedDeploys = deploys.filter((d) => d.causedIncident).length
    const changeFailureRate = deploys.length > 0 ? (failedDeploys / deploys.length) * 100 : 0

    // Time to restore from incidents with TTR data in window
    const incidents = await IncidentEvent.query()
      .where('tech_stream_id', this.techStreamId)
      .where('occurred_at', '>=', windowStart.toSQL()!)
      .whereNotNull('time_to_restore_min')

    const ttrValues = incidents.map((i) => i.timeToRestoreMin!).sort((a, b) => a - b)
    const ttrMedian = this.percentile(ttrValues, 50)
    const ttrMean =
      ttrValues.length > 0 ? ttrValues.reduce((sum, v) => sum + v, 0) / ttrValues.length : 0

    // Lead time from production deploys with lead_time_hrs
    const leadTimes = deploys
      .filter((d) => d.leadTimeHrs !== null)
      .map((d) => Number(d.leadTimeHrs))
      .sort((a, b) => a - b)

    const leadTimeP50 = leadTimes.length > 0 ? this.percentile(leadTimes, 50) : null
    const leadTimeP85 = leadTimes.length > 0 ? this.percentile(leadTimes, 85) : null

    return {
      deploymentFrequency,
      changeFailureRate,
      ttrMedian,
      ttrMean,
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
