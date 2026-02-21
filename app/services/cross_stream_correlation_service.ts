import { DateTime } from 'luxon'
import TechStream from '#models/tech_stream'
import WorkItemEvent from '#models/work_item_event'
import SprintConfidenceService from '#services/sprint_confidence_service'

export interface CorrelationResult {
  techStreamId: number
  blockCount14d: number
  impactedDeliveryStreamIds: number[]
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical'
  avgConfidencePct: number | null
}

export default class CrossStreamCorrelationService {
  async computeForTechStream(techStreamId: number): Promise<CorrelationResult> {
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
    const severity = this.computeSeverity(impactedStreamIds.length, avgConfidencePct)

    return {
      techStreamId,
      blockCount14d,
      impactedDeliveryStreamIds: impactedStreamIds,
      severity,
      avgConfidencePct,
    }
  }

  async computeAll(): Promise<CorrelationResult[]> {
    const techStreams = await TechStream.query().where('is_active', true)
    return Promise.all(techStreams.map((ts) => this.computeForTechStream(ts.id)))
  }

  private computeSeverity(
    impactedCount: number,
    avgConfidence: number
  ): 'none' | 'low' | 'medium' | 'high' | 'critical' {
    if (impactedCount === 0) return 'none'
    if (impactedCount >= 3 && avgConfidence < 60) return 'critical'
    if (impactedCount >= 2 && avgConfidence < 70) return 'high'
    if (impactedCount >= 2 && avgConfidence >= 70) return 'medium'
    if (impactedCount === 1 && avgConfidence < 70) return 'medium'
    return 'low'
  }
}
