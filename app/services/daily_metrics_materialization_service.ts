import { DateTime } from 'luxon'
import DeliveryStream from '#models/delivery_stream'
import TechStream from '#models/tech_stream'
import DailyStreamMetric from '#models/daily_stream_metric'
import type { StreamType } from '#models/daily_stream_metric'
import CycleTimeService from '#services/cycle_time_service'
import FlowEfficiencyService from '#services/flow_efficiency_service'
import DefectEscapeRateService from '#services/defect_escape_rate_service'
import WipMetricsService from '#services/wip_metrics_service'
import DoraMetricsService from '#services/dora_metrics_service'
import PrReviewTurnaroundService from '#services/pr_review_turnaround_service'

interface MetricRow {
  streamType: StreamType
  streamId: number
  metricName: string
  metricValue: number
  metricUnit: string
  percentile: number | null
  sampleSize: number
}

export default class DailyMetricsMaterializationService {
  private readonly today: string

  constructor() {
    this.today = DateTime.now().toISODate()!
  }

  async run(): Promise<number> {
    const [deliveryStreams, techStreams] = await Promise.all([
      DeliveryStream.query().where('is_active', true),
      TechStream.query().where('is_active', true),
    ])

    await Promise.all([
      ...deliveryStreams.map((s) => this.materializeDeliveryStream(s)),
      ...techStreams.map((s) => this.materializeTechStream(s)),
    ])

    const count = await DailyStreamMetric.query()
      .where('metric_date', this.today)
      .count('* as total')
    return Number(count[0].$extras.total)
  }

  private async materializeDeliveryStream(stream: DeliveryStream): Promise<void> {
    const [cycleTime, flowEfficiency, defectEscape, wip] = await Promise.all([
      new CycleTimeService().compute(stream.id),
      new FlowEfficiencyService().compute(stream.id),
      new DefectEscapeRateService(stream.id).compute(),
      new WipMetricsService().compute(stream.id),
    ])

    const metrics: MetricRow[] = []

    // Cycle time percentiles — only written when there is data
    if (cycleTime.count > 0) {
      metrics.push(
        {
          streamType: 'delivery',
          streamId: stream.id,
          metricName: 'cycle_time_p50',
          metricValue: cycleTime.p50,
          metricUnit: 'days',
          percentile: 50,
          sampleSize: cycleTime.count,
        },
        {
          streamType: 'delivery',
          streamId: stream.id,
          metricName: 'cycle_time_p85',
          metricValue: cycleTime.p85,
          metricUnit: 'days',
          percentile: 85,
          sampleSize: cycleTime.count,
        },
        {
          streamType: 'delivery',
          streamId: stream.id,
          metricName: 'cycle_time_p95',
          metricValue: cycleTime.p95,
          metricUnit: 'days',
          percentile: 95,
          sampleSize: cycleTime.count,
        }
      )
    }

    // Flow efficiency
    if (flowEfficiency.avgFlowEfficiencyPct !== null) {
      metrics.push({
        streamType: 'delivery',
        streamId: stream.id,
        metricName: 'flow_efficiency',
        metricValue: flowEfficiency.avgFlowEfficiencyPct,
        metricUnit: 'percent',
        percentile: null,
        sampleSize: flowEfficiency.count,
      })
    }

    // Defect escape rate
    if (defectEscape.count > 0) {
      metrics.push({
        streamType: 'delivery',
        streamId: stream.id,
        metricName: 'defect_escape_rate',
        metricValue: defectEscape.escapeRatePct,
        metricUnit: 'percent',
        percentile: null,
        sampleSize: defectEscape.count,
      })
    }

    // WIP by stage (snapshot — one row per stage present in the WIP map)
    for (const [stage, count] of Object.entries(wip)) {
      metrics.push({
        streamType: 'delivery',
        streamId: stream.id,
        metricName: `wip_${stage}`,
        metricValue: count,
        metricUnit: 'count',
        percentile: null,
        sampleSize: 1,
      })
    }

    await Promise.all(metrics.map((m) => this.upsert(m)))
  }

  private async materializeTechStream(stream: TechStream): Promise<void> {
    const [dora, prReview] = await Promise.all([
      new DoraMetricsService(stream.id).compute(),
      new PrReviewTurnaroundService(stream.id, 30, stream.minContributors).compute(),
    ])

    const metrics: MetricRow[] = [
      {
        streamType: 'tech',
        streamId: stream.id,
        metricName: 'deployment_frequency',
        metricValue: dora.deploymentFrequency,
        metricUnit: 'per_week',
        percentile: null,
        sampleSize: dora.deployCount,
      },
      {
        streamType: 'tech',
        streamId: stream.id,
        metricName: 'change_failure_rate',
        metricValue: dora.changeFailureRate,
        metricUnit: 'percent',
        percentile: null,
        sampleSize: dora.deployCount,
      },
      {
        streamType: 'tech',
        streamId: stream.id,
        metricName: 'ttr_median',
        metricValue: dora.ttrMedian,
        metricUnit: 'minutes',
        percentile: null,
        sampleSize: dora.incidentCount,
      },
      {
        streamType: 'tech',
        streamId: stream.id,
        metricName: 'ttr_mean',
        metricValue: dora.ttrMean,
        metricUnit: 'minutes',
        percentile: null,
        sampleSize: dora.incidentCount,
      },
      {
        streamType: 'tech',
        streamId: stream.id,
        metricName: 'review_turnaround_p50',
        metricValue: prReview.p50,
        metricUnit: 'hours',
        percentile: 50,
        sampleSize: 1,
      },
      {
        streamType: 'tech',
        streamId: stream.id,
        metricName: 'review_turnaround_p85',
        metricValue: prReview.p85,
        metricUnit: 'hours',
        percentile: 85,
        sampleSize: 1,
      },
    ]

    // Lead time — only written when deploys with lead time data exist
    if (dora.leadTimeP50 !== null) {
      metrics.push({
        streamType: 'tech',
        streamId: stream.id,
        metricName: 'lead_time_p50',
        metricValue: dora.leadTimeP50,
        metricUnit: 'hours',
        percentile: 50,
        sampleSize: dora.leadTimeDeployCount,
      })
    }

    if (dora.leadTimeP85 !== null) {
      metrics.push({
        streamType: 'tech',
        streamId: stream.id,
        metricName: 'lead_time_p85',
        metricValue: dora.leadTimeP85,
        metricUnit: 'hours',
        percentile: 85,
        sampleSize: dora.leadTimeDeployCount,
      })
    }

    await Promise.all(metrics.map((m) => this.upsert(m)))
  }

  /**
   * Upserts a single metric row for today. Handles the NULL percentile case
   * explicitly since PostgreSQL treats NULL != NULL in unique constraints.
   */
  private async upsert(row: MetricRow): Promise<void> {
    let query = DailyStreamMetric.query()
      .where('metric_date', this.today)
      .where('stream_type', row.streamType)
      .where('stream_id', row.streamId)
      .where('metric_name', row.metricName)

    if (row.percentile === null) {
      query = query.whereNull('percentile')
    } else {
      query = query.where('percentile', row.percentile)
    }

    const existing = await query.first()

    if (existing) {
      existing.metricValue = row.metricValue
      existing.sampleSize = row.sampleSize
      existing.computedAt = DateTime.now()
      await existing.save()
    } else {
      await DailyStreamMetric.create({
        metricDate: this.today,
        streamType: row.streamType,
        streamId: row.streamId,
        metricName: row.metricName,
        metricValue: row.metricValue,
        metricUnit: row.metricUnit,
        percentile: row.percentile,
        sampleSize: row.sampleSize,
      })
    }
  }
}
