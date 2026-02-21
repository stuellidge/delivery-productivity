import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import WipMetricsService from '#services/wip_metrics_service'
import CycleTimeService from '#services/cycle_time_service'
import FlowEfficiencyService from '#services/flow_efficiency_service'
import TechStream from '#models/tech_stream'
import DoraMetricsService from '#services/dora_metrics_service'
import MonteCarloForecastService from '#services/monte_carlo_forecast_service'
import CrossStreamCorrelationService from '#services/cross_stream_correlation_service'
import PulseAggregate from '#models/pulse_aggregate'

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

  async forecast({ request, response }: HttpContext) {
    const streamId = Number(request.input('stream', 0))
    const windowWeeks = request.input('window') ? Number(request.input('window')) : 12

    const forecast = await new MonteCarloForecastService(streamId, windowWeeks).compute()

    return response.ok({
      status: 'ok',
      data: { forecast },
      meta: {
        stream_id: streamId,
        window_weeks: windowWeeks,
        computed_at: DateTime.now().toISO(),
      },
    })
  }

  async pulse({ request, response }: HttpContext) {
    const streamId = Number(request.input('stream', 0))
    const periods = request.input('periods') ? Number(request.input('periods')) : 6

    const aggregates = await PulseAggregate.query()
      .where('delivery_stream_id', streamId)
      .orderBy('survey_period', 'desc')
      .limit(periods)

    return response.ok({
      status: 'ok',
      data: { aggregates },
      meta: {
        stream_id: streamId,
        periods,
        computed_at: DateTime.now().toISO(),
      },
    })
  }

  async crossStream({ request, response }: HttpContext) {
    const techStreamId = request.input('tech_stream') ? Number(request.input('tech_stream')) : null
    const service = new CrossStreamCorrelationService()

    const correlations = techStreamId
      ? [await service.computeForTechStream(techStreamId)]
      : await service.computeAll()

    return response.ok({
      status: 'ok',
      data: { correlations },
      meta: {
        tech_stream_id: techStreamId ?? null,
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
