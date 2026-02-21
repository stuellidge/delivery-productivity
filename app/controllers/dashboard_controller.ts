import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import DeliveryStream from '#models/delivery_stream'
import WorkItemCycle from '#models/work_item_cycle'
import WipMetricsService from '#services/wip_metrics_service'
import CycleTimeService from '#services/cycle_time_service'
import FlowEfficiencyService from '#services/flow_efficiency_service'

const STAGE_ORDER = ['backlog', 'ba', 'dev', 'code_review', 'qa', 'uat']
const STAGE_LABELS: Record<string, string> = {
  backlog: 'Backlog',
  ba: 'BA',
  dev: 'Dev',
  code_review: 'Code Review',
  qa: 'QA',
  uat: 'UAT',
}

export default class DashboardController {
  async index({ view, request }: HttpContext) {
    const deliveryStreams = await DeliveryStream.query().where('is_active', true).orderBy('name')

    const selectedStreamId = request.input('stream') ? Number(request.input('stream')) : undefined
    const windowDays = request.input('window') ? Number(request.input('window')) : 30

    let selectedStream = null
    if (selectedStreamId) {
      selectedStream = await DeliveryStream.find(selectedStreamId)
    }

    const [wipByStage, cycleTimeStats, flowEfficiency] = await Promise.all([
      new WipMetricsService().compute(selectedStreamId),
      new CycleTimeService().compute(selectedStreamId, windowDays),
      new FlowEfficiencyService().compute(selectedStreamId, windowDays),
    ])

    // Ordered WIP stages for display (exclude done/cancelled)
    const wipStages = STAGE_ORDER.map((stage) => ({
      key: stage,
      label: STAGE_LABELS[stage],
      count: wipByStage[stage as keyof typeof wipByStage] ?? 0,
    }))

    // Individual cycle records for scatter plot
    const windowStart = DateTime.now().minus({ days: windowDays })
    let cycleQuery = WorkItemCycle.query()
      .where('completed_at', '>=', windowStart.toSQL()!)
      .orderBy('completed_at', 'asc')

    if (selectedStreamId) {
      cycleQuery = cycleQuery.where('delivery_stream_id', selectedStreamId)
    }

    const cycleRecords = await cycleQuery

    const cycleScatterData = JSON.stringify(
      cycleRecords.map((c) => ({
        x: c.completedAt.toISO(),
        y: Number(c.cycleTimeDays),
        ticketId: c.ticketId,
      }))
    )

    return view.render('dashboard/index', {
      deliveryStreams,
      selectedStream,
      selectedStreamId: selectedStreamId ?? null,
      windowDays,
      wipStages,
      cycleTimeStats,
      cycleScatterData,
      flowEfficiency,
    })
  }
}
