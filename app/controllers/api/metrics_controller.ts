import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import WipMetricsService from '#services/wip_metrics_service'
import CycleTimeService from '#services/cycle_time_service'
import FlowEfficiencyService from '#services/flow_efficiency_service'
import TechStream from '#models/tech_stream'
import DoraMetricsService from '#services/dora_metrics_service'

export default class ApiMetricsController {
  async realtime({ request, response }: HttpContext) {
    const streamId = request.input('stream') ? Number(request.input('stream')) : undefined

    const [wipByStage, cycleTime] = await Promise.all([
      new WipMetricsService().compute(streamId),
      new CycleTimeService().compute(streamId),
    ])

    return response.ok({
      status: 'ok',
      data: { wip_by_stage: wipByStage, cycle_time: cycleTime },
      meta: {
        stream_id: streamId ?? null,
        computed_at: DateTime.now().toISO(),
      },
    })
  }

  async diagnostic({ request, response }: HttpContext) {
    const streamId = request.input('stream') ? Number(request.input('stream')) : undefined
    const windowDays = request.input('window') ? Number(request.input('window')) : 30

    const flowEfficiency = await new FlowEfficiencyService().compute(streamId, windowDays)

    return response.ok({
      status: 'ok',
      data: { flow_efficiency: flowEfficiency },
      meta: {
        stream_id: streamId ?? null,
        window_days: windowDays,
        computed_at: DateTime.now().toISO(),
      },
    })
  }

  async trends({ request, response }: HttpContext) {
    const windowDays = request.input('window') ? Number(request.input('window')) : 30
    const techStreams = await TechStream.query().where('is_active', true)
    const metrics = await Promise.all(
      techStreams.map(async (ts) => ({
        techStreamId: ts.id,
        techStreamName: ts.displayName,
        ...(await new DoraMetricsService(ts.id, windowDays).compute()),
      }))
    )
    return response.ok({
      status: 'ok',
      data: { dora: metrics },
      meta: { window_days: windowDays, computed_at: DateTime.now().toISO() },
    })
  }
}
