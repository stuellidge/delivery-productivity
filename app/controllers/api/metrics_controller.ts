import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import WipMetricsService from '#services/wip_metrics_service'
import CycleTimeService from '#services/cycle_time_service'
import FlowEfficiencyService from '#services/flow_efficiency_service'
import TechStream from '#models/tech_stream'
import DoraMetricsService from '#services/dora_metrics_service'
import DoraTrendService from '#services/dora_trend_service'
import MonteCarloForecastService from '#services/monte_carlo_forecast_service'
import CrossStreamCorrelationService from '#services/cross_stream_correlation_service'
import DefectEscapeRateService from '#services/defect_escape_rate_service'
import PrReviewTurnaroundService from '#services/pr_review_turnaround_service'
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
      const [flowEfficiency, defectEscape] = await Promise.all([
        new FlowEfficiencyService().compute(streamId, windowDays),
        new DefectEscapeRateService(streamId, windowDays).compute(),
      ])

      // PR turnaround requires a techStreamId; skip if no stream specified
      // When a deliveryStreamId is given we compute across all tech streams (pass undefined)
      const prReviewTurnaround = await new PrReviewTurnaroundService(
        streamId ?? 0,
        windowDays
      ).compute()

      return {
        flow_efficiency: flowEfficiency,
        defect_escape: defectEscape,
        pr_review_turnaround: prReviewTurnaround,
      }
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
    const streamId = request.input('tech_stream') ? Number(request.input('tech_stream')) : null
    const windowDays = request.input('window') ? Number(request.input('window')) : 90
    const cacheKey = `metrics:trends:${streamId ?? 'all'}:${windowDays}`

    if (streamId) {
      const data = await cache.remember(cacheKey, TTL.trends, async () => {
        const series = await new DoraTrendService(streamId, windowDays).compute()
        return { series }
      })
      return response.ok({
        status: 'ok',
        data,
        meta: { tech_stream_id: streamId, window_days: windowDays, computed_at: DateTime.now().toISO() },
      })
    }

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
