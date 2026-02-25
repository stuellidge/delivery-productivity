import db from '@adonisjs/lucid/services/db'
import PulseAggregate from '#models/pulse_aggregate'

export interface DataQualityMetrics {
  prLinkageRate: number
  prTotal: number
  ticketTaggingRate: number
  ticketTotal: number
  defectAttributionRate: number
  defectTotal: number
  deploymentTraceabilityRate: number
  deploymentTotal: number
  pulseResponseRate: number
  pulseStreamsSampled: number
  warnings: { metric: string; rate: number; target: number }[]
}

// Thresholds below which a warning is emitted (spec §5.6)
const TARGETS = {
  prLinkageRate: 90,
  ticketTaggingRate: 95,
  defectAttributionRate: 70,
  deploymentTraceabilityRate: 80,
  pulseResponseRate: 60,
}

export default class DataQualityService {
  async compute(): Promise<DataQualityMetrics> {
    const [prStats, ticketStats, deployStats, defectStats, pulseStats] = await Promise.all([
      this.getPrStats(),
      this.getTicketStats(),
      this.getDeploymentStats(),
      this.getDefectStats(),
      this.getPulseResponseRate(),
    ])

    const warnings: { metric: string; rate: number; target: number }[] = []

    if (prStats.total > 0 && prStats.linkedRate < TARGETS.prLinkageRate) {
      warnings.push({
        metric: 'prLinkageRate',
        rate: prStats.linkedRate,
        target: TARGETS.prLinkageRate,
      })
    }
    if (ticketStats.total > 0 && ticketStats.taggedRate < TARGETS.ticketTaggingRate) {
      warnings.push({
        metric: 'ticketTaggingRate',
        rate: ticketStats.taggedRate,
        target: TARGETS.ticketTaggingRate,
      })
    }
    if (deployStats.total > 0 && deployStats.traceableRate < TARGETS.deploymentTraceabilityRate) {
      warnings.push({
        metric: 'deploymentTraceabilityRate',
        rate: deployStats.traceableRate,
        target: TARGETS.deploymentTraceabilityRate,
      })
    }
    if (defectStats.total > 0 && defectStats.attributionRate < TARGETS.defectAttributionRate) {
      warnings.push({
        metric: 'defectAttributionRate',
        rate: defectStats.attributionRate,
        target: TARGETS.defectAttributionRate,
      })
    }
    if (pulseStats.sampledStreams > 0 && pulseStats.avgRate < TARGETS.pulseResponseRate) {
      warnings.push({
        metric: 'pulseResponseRate',
        rate: pulseStats.avgRate,
        target: TARGETS.pulseResponseRate,
      })
    }

    return {
      prLinkageRate: prStats.linkedRate,
      prTotal: prStats.total,
      ticketTaggingRate: ticketStats.taggedRate,
      ticketTotal: ticketStats.total,
      defectAttributionRate: defectStats.attributionRate,
      defectTotal: defectStats.total,
      deploymentTraceabilityRate: deployStats.traceableRate,
      deploymentTotal: deployStats.total,
      pulseResponseRate: pulseStats.avgRate,
      pulseStreamsSampled: pulseStats.sampledStreams,
      warnings,
    }
  }

  /**
   * Returns warning strings for metrics below target, scoped to a delivery stream.
   */
  async getStreamWarnings(deliveryStreamId: number): Promise<string[]> {
    const warnings: string[] = []

    // PR linkage rate — scoped to tech streams with repos that have prEvents linked to this stream
    // We check all PRs for the tech streams associated with this delivery stream
    const [prRow] = await db.from('pr_events').count('* as total')
    const [linkedRow] = await db
      .from('pr_events')
      .whereNotNull('linked_ticket_id')
      .count('* as linked')
    const prTotal = Number(prRow.total)
    const prLinkageRate = prTotal > 0 ? (Number(linkedRow.linked) / prTotal) * 100 : 100

    if (prTotal > 0 && prLinkageRate < TARGETS.prLinkageRate) {
      warnings.push(
        `PR linkage rate is ${prLinkageRate.toFixed(1)}% (target: ${TARGETS.prLinkageRate}%)`
      )
    }

    // Ticket tagging rate — scoped to this delivery stream
    const [ticketRow] = await db
      .from('work_item_events')
      .where('delivery_stream_id', deliveryStreamId)
      .count('* as total')
    const [taggedRow] = await db
      .from('work_item_events')
      .where('delivery_stream_id', deliveryStreamId)
      .whereNotNull('delivery_stream_id')
      .count('* as tagged')
    const ticketTotal = Number(ticketRow.total)
    const ticketTaggingRate = ticketTotal > 0 ? (Number(taggedRow.tagged) / ticketTotal) * 100 : 100

    if (ticketTotal > 0 && ticketTaggingRate < TARGETS.ticketTaggingRate) {
      warnings.push(
        `Ticket tagging rate is ${ticketTaggingRate.toFixed(1)}% (target: ${TARGETS.ticketTaggingRate}%)`
      )
    }

    // Deployment traceability — scoped by tech streams linked to this delivery stream
    const [deployRow] = await db
      .from('deployment_records')
      .where('environment', 'production')
      .count('* as total')
    const [traceRow] = await db
      .from('deployment_records')
      .where('environment', 'production')
      .whereNotNull('linked_ticket_id')
      .count('* as traceable')
    const deployTotal = Number(deployRow.total)
    const deployTraceRate = deployTotal > 0 ? (Number(traceRow.traceable) / deployTotal) * 100 : 100

    if (deployTotal > 0 && deployTraceRate < TARGETS.deploymentTraceabilityRate) {
      warnings.push(
        `Deployment traceability is ${deployTraceRate.toFixed(1)}% (target: ${TARGETS.deploymentTraceabilityRate}%)`
      )
    }

    // Defect attribution rate — scoped to this delivery stream
    const defectStats = await this.getDefectStats(deliveryStreamId)
    if (defectStats.total > 0 && defectStats.attributionRate < TARGETS.defectAttributionRate) {
      warnings.push(
        `Defect attribution rate is ${defectStats.attributionRate.toFixed(1)}% (target: ${TARGETS.defectAttributionRate}%)`
      )
    }

    // Pulse response rate — scoped to this delivery stream
    const latestAggregate = await PulseAggregate.query()
      .where('delivery_stream_id', deliveryStreamId)
      .orderBy('survey_period', 'desc')
      .first()
    if (latestAggregate && Number(latestAggregate.responseRatePct) < TARGETS.pulseResponseRate) {
      warnings.push(
        `Pulse response rate is ${Number(latestAggregate.responseRatePct).toFixed(1)}% (target: ${TARGETS.pulseResponseRate}%)`
      )
    }

    return warnings
  }

  private async getPrStats(): Promise<{ total: number; linkedRate: number }> {
    const [totalRow] = await db.from('pr_events').count('* as total')
    const [linkedRow] = await db
      .from('pr_events')
      .whereNotNull('linked_ticket_id')
      .count('* as linked')

    const total = Number(totalRow.total)
    const linked = Number(linkedRow.linked)
    const linkedRate = total > 0 ? (linked / total) * 100 : 0

    return { total, linkedRate }
  }

  private async getTicketStats(): Promise<{ total: number; taggedRate: number }> {
    const [totalRow] = await db.from('work_item_events').count('* as total')
    const [taggedRow] = await db
      .from('work_item_events')
      .whereNotNull('delivery_stream_id')
      .count('* as tagged')

    const total = Number(totalRow.total)
    const tagged = Number(taggedRow.tagged)
    const taggedRate = total > 0 ? (tagged / total) * 100 : 0

    return { total, taggedRate }
  }

  private async getDefectStats(
    deliveryStreamId?: number
  ): Promise<{ total: number; attributionRate: number }> {
    let totalQuery = db.from('defect_events')
    let attributedQuery = db.from('defect_events').whereNotNull('introduced_in_stage')

    if (deliveryStreamId !== undefined) {
      totalQuery = totalQuery.where('delivery_stream_id', deliveryStreamId)
      attributedQuery = attributedQuery.where('delivery_stream_id', deliveryStreamId)
    }

    const [totalRow] = await totalQuery.count('* as total')
    const [attributedRow] = await attributedQuery.count('* as attributed')

    const total = Number(totalRow.total)
    const attributed = Number(attributedRow.attributed)
    const attributionRate = total > 0 ? (attributed / total) * 100 : 0

    return { total, attributionRate }
  }

  private async getDeploymentStats(): Promise<{ total: number; traceableRate: number }> {
    const [totalRow] = await db
      .from('deployment_records')
      .where('environment', 'production')
      .count('* as total')
    const [traceableRow] = await db
      .from('deployment_records')
      .where('environment', 'production')
      .whereNotNull('linked_ticket_id')
      .count('* as traceable')

    const total = Number(totalRow.total)
    const traceable = Number(traceableRow.traceable)
    const traceableRate = total > 0 ? (traceable / total) * 100 : 0

    return { total, traceableRate }
  }

  private async getPulseResponseRate(): Promise<{ avgRate: number; sampledStreams: number }> {
    // Get the latest pulse_aggregate per delivery stream
    const rows = await db
      .from('pulse_aggregates as pa')
      .whereNotNull('pa.response_rate_pct')
      .whereRaw(
        'pa.survey_period = (SELECT MAX(pa2.survey_period) FROM pulse_aggregates pa2 WHERE pa2.delivery_stream_id = pa.delivery_stream_id)'
      )
      .select('pa.delivery_stream_id', 'pa.response_rate_pct')

    if (rows.length === 0) return { avgRate: 0, sampledStreams: 0 }

    const total = rows.reduce((sum: number, row: any) => sum + Number(row.response_rate_pct), 0)
    return { avgRate: total / rows.length, sampledStreams: rows.length }
  }
}
