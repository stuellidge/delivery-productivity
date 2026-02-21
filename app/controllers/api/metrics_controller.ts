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
import { cache } from '#services/cache_service'

// Cache TTLs in seconds
const TTL = {
  realtime: 30,
  diagnostic: 900,
  trends: 300,
  forecast: 3600,
  pulse: 86400,
  crossStream: 300,
}

export default class ApiMetricsController {
  async realtime({ request, response }: HttpContext) {
    const streamId = request.input('stream') ? Number(request.input('stream')) : undefined
    const cacheKey = `metrics:realtime:${streamId ?? 'all'}`

    const data = await cache.remember(cacheKey, TTL.realtime, async () => {
      const [wipByStage, cycleTime] = await Promise.all([
        new WipMetricsService().compute(streamId),
        new CycleTimeService().compute(streamId),
      ])
      return { wip_by_stage: wipByStage, cycle_time: cycleTime }
    })

    return response.ok({
      status: 'ok',
      data,
      meta: { stream_id: streamId ?? null, computed_at: DateTime.now().toISO() },
    })
  }

  async diagnostic({ request, response }: HttpContext) {
    const streamId = request.input('stream') ? Number(request.input('stream')) : undefined
    const windowDays = request.input('window') ? Number(request.input('window')) : 30
    const cacheKey = `metrics:diagnostic:${streamId ?? 'all'}:${windowDays}`

    const data = await cache.remember(cacheKey, TTL.diagnostic, async () => {
      const flowEfficiency = await new FlowEfficiencyService().compute(streamId, windowDays)
      return { flow_efficiency: flowEfficiency }
    })

    return response.ok({
      status: 'ok',
      data,
      meta: { stream_id: streamId ?? null, window_days: windowDays, computed_at: DateTime.now().toISO() },
    })
  }

  async forecast({ request, response }: HttpContext) {
    const streamId = Number(request.input('stream', 0))
    const windowWeeks = request.input('window') ? Number(request.input('window')) : 12
    const cacheKey = `metrics:forecast:${streamId}`

    const data = await cache.remember(cacheKey, TTL.forecast, async () => {
      const forecast = await new MonteCarloForecastService(streamId, windowWeeks).compute()
      return { forecast }
    })

    return response.ok({
      status: 'ok',
      data,
      meta: { stream_id: streamId, window_weeks: windowWeeks, computed_at: DateTime.now().toISO() },
    })
  }

  async pulse({ request, response }: HttpContext) {
    const streamId = Number(request.input('stream', 0))
    const periods = request.input('periods') ? Number(request.input('periods')) : 6
    const cacheKey = `metrics:pulse:${streamId}:${periods}`

    const data = await cache.remember(cacheKey, TTL.pulse, async () => {
      const aggregates = await PulseAggregate.query()
        .where('delivery_stream_id', streamId)
        .orderBy('survey_period', 'desc')
        .limit(periods)
      return { aggregates }
    })

    return response.ok({
      status: 'ok',
      data,
      meta: { stream_id: streamId, periods, computed_at: DateTime.now().toISO() },
    })
  }

  async crossStream({ request, response }: HttpContext) {
    const techStreamId = request.input('tech_stream') ? Number(request.input('tech_stream')) : null
    const cacheKey = `metrics:cross-stream:${techStreamId ?? 'all'}`
    const service = new CrossStreamCorrelationService()

    const data = await cache.remember(cacheKey, TTL.crossStream, async () => {
      const correlations = techStreamId
        ? [await service.computeForTechStream(techStreamId)]
        : await service.computeAll()
      return { correlations }
    })

    return response.ok({
      status: 'ok',
      data,
      meta: { tech_stream_id: techStreamId ?? null, computed_at: DateTime.now().toISO() },
    })
  }

  async trends({ request, response }: HttpContext) {
    const windowDays = request.input('window') ? Number(request.input('window')) : 30
    const cacheKey = `metrics:trends:all:${windowDays}`

    const data = await cache.remember(cacheKey, TTL.trends, async () => {
      const techStreams = await TechStream.query().where('is_active', true)
      const dora = await Promise.all(
        techStreams.map(async (ts) => ({
          techStreamId: ts.id,
          techStreamName: ts.displayName,
          ...(await new DoraMetricsService(ts.id, windowDays).compute()),
        }))
      )
      return { dora }
    })

    return response.ok({
      status: 'ok',
      data,
      meta: { window_days: windowDays, computed_at: DateTime.now().toISO() },
    })
  }
}
