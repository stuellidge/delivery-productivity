import { DateTime } from 'luxon'
import TechStream from '#models/tech_stream'
import WorkItemEvent from '#models/work_item_event'
import PlatformSetting from '#models/platform_setting'
import CrossStreamCorrelation from '#models/cross_stream_correlation'
import SprintConfidenceService from '#services/sprint_confidence_service'

export interface CorrelationResult {
  techStreamId: number
  blockCount14d: number
  impactedDeliveryStreamIds: number[]
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical'
  avgConfidencePct: number | null
}

interface SeverityThreshold {
  minStreams: number
  maxConfidence: number
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical'
}

const DEFAULT_THRESHOLDS: SeverityThreshold[] = [
  { minStreams: 3, maxConfidence: 60, severity: 'critical' },
  { minStreams: 2, maxConfidence: 70, severity: 'high' },
  { minStreams: 2, maxConfidence: 100, severity: 'medium' },
  { minStreams: 1, maxConfidence: 70, severity: 'medium' },
  { minStreams: 1, maxConfidence: 100, severity: 'low' },
]

export default class CrossStreamCorrelationService {
  async computeForTechStream(
    techStreamId: number,
    thresholds?: SeverityThreshold[]
  ): Promise<CorrelationResult> {
    const resolvedThresholds =
      thresholds ??
      (await PlatformSetting.get<SeverityThreshold[]>(
        'cross_stream_severity_thresholds',
        DEFAULT_THRESHOLDS
      ))

    const since = DateTime.now().minus({ days: 14 })

    const blockedEvents = await WorkItemEvent.query()
      .where('event_type', 'blocked')
      .where('blocking_tech_stream_id', techStreamId)
      .where('event_timestamp', '>=', since.toSQL()!)
      .whereNotNull('delivery_stream_id')

    const blockCount14d = blockedEvents.length

    // Distinct impacted delivery streams
    const impactedStreamIds = [...new Set(blockedEvents.map((e) => e.deliveryStreamId!))]

    if (impactedStreamIds.length === 0) {
      return {
        techStreamId,
        blockCount14d: 0,
        impactedDeliveryStreamIds: [],
        severity: 'none',
        avgConfidencePct: null,
      }
    }

    // Compute sprint confidence for each impacted stream
    const confidences = await Promise.all(
      impactedStreamIds.map(async (dsId) => {
        const result = await new SprintConfidenceService(dsId).compute()
        return result.confidence
      })
    )

    const avgConfidencePct = confidences.reduce((sum, c) => sum + c, 0) / confidences.length
    const severity = this.computeSeverity(
      impactedStreamIds.length,
      avgConfidencePct,
      resolvedThresholds
    )

    return {
      techStreamId,
      blockCount14d,
      impactedDeliveryStreamIds: impactedStreamIds,
      severity,
      avgConfidencePct,
    }
  }

  async computeAll(): Promise<CorrelationResult[]> {
    // Load thresholds once for the whole run
    const thresholds = await PlatformSetting.get<SeverityThreshold[]>(
      'cross_stream_severity_thresholds',
      DEFAULT_THRESHOLDS
    )

    const techStreams = await TechStream.query().where('is_active', true)
    return Promise.all(techStreams.map((ts) => this.computeForTechStream(ts.id, thresholds)))
  }

  async materializeAll(): Promise<CrossStreamCorrelation[]> {
    const results = await this.computeAll()
    const today = DateTime.now().toISODate()!

    for (const r of results) {
      await CrossStreamCorrelation.updateOrCreate(
        { analysisDate: today, techStreamId: r.techStreamId },
        {
          impactedDeliveryStreams: r.impactedDeliveryStreamIds,
          blockedDeliveryStreams: [],
          blockCount14d: r.blockCount14d,
          avgConfidencePct: r.avgConfidencePct,
          avgCycleTimeP85: null,
          severity: r.severity,
          computedAt: DateTime.now(),
        }
      )
    }

    return CrossStreamCorrelation.query()
      .where('analysis_date', today)
      .orderBy('block_count_14d', 'desc')
  }

  private computeSeverity(
    impactedCount: number,
    avgConfidence: number,
    thresholds: SeverityThreshold[]
  ): 'none' | 'low' | 'medium' | 'high' | 'critical' {
    if (impactedCount === 0) return 'none'
    // Evaluate thresholds in order — first match wins
    for (const threshold of thresholds) {
      if (impactedCount >= threshold.minStreams && avgConfidence <= threshold.maxConfidence) {
        return threshold.severity
      }
    }
    return 'low'
  }
}
