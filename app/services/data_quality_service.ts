import db from '@adonisjs/lucid/services/db'

export interface DataQualityMetrics {
  prLinkageRate: number
  prTotal: number
  ticketTaggingRate: number
  ticketTotal: number
  defectAttributionRate: number
  defectTotal: number
  deploymentTraceabilityRate: number
  deploymentTotal: number
  warnings: { metric: string; rate: number; target: number }[]
}

// Thresholds below which a warning is emitted
const TARGETS = {
  prLinkageRate: 80,
  ticketTaggingRate: 90,
  defectAttributionRate: 70,
  deploymentTraceabilityRate: 80,
}

export default class DataQualityService {
  async compute(): Promise<DataQualityMetrics> {
    const [prStats, ticketStats, deployStats] = await Promise.all([
      this.getPrStats(),
      this.getTicketStats(),
      this.getDeploymentStats(),
    ])

    const defectTotal = 0
    const defectAttributionRate = 0

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

    return {
      prLinkageRate: prStats.linkedRate,
      prTotal: prStats.total,
      ticketTaggingRate: ticketStats.taggedRate,
      ticketTotal: ticketStats.total,
      defectAttributionRate,
      defectTotal,
      deploymentTraceabilityRate: deployStats.traceableRate,
      deploymentTotal: deployStats.total,
      warnings,
    }
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
}
