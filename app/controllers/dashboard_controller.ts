import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import DeliveryStream from '#models/delivery_stream'
import TechStream from '#models/tech_stream'
import WorkItemCycle from '#models/work_item_cycle'
import PulseAggregate from '#models/pulse_aggregate'
import CrossStreamCorrelation from '#models/cross_stream_correlation'
import Sprint from '#models/sprint'
import WipMetricsService from '#services/wip_metrics_service'
import CycleTimeService from '#services/cycle_time_service'
import FlowEfficiencyService from '#services/flow_efficiency_service'
import PrReviewTurnaroundService from '#services/pr_review_turnaround_service'
import DoraMetricsService from '#services/dora_metrics_service'
import MonteCarloForecastService from '#services/monte_carlo_forecast_service'
import SprintConfidenceService from '#services/sprint_confidence_service'
import CrossStreamCorrelationService from '#services/cross_stream_correlation_service'
import DataQualityService from '#services/data_quality_service'
import DefectEscapeRateService from '#services/defect_escape_rate_service'
import DoraTrendService from '#services/dora_trend_service'

const STAGE_ORDER = ['backlog', 'ba', 'dev', 'code_review', 'qa', 'uat']
const STAGE_LABELS: Record<string, string> = {
  backlog: 'Backlog',
  ba: 'BA',
  dev: 'Dev',
  code_review: 'Code Review',
  qa: 'QA',
  uat: 'UAT',
}

const ALL_ZONES = ['realtime', 'diagnostic', 'trend', 'forecast', 'health'] as const
type Zone = (typeof ALL_ZONES)[number]

const ZONE_LABELS: Record<Zone, string> = {
  realtime: 'Real-Time',
  diagnostic: 'Diagnostic',
  trend: 'Trend',
  forecast: 'Forecast',
  health: 'Health',
}

export default class DashboardController {
  async index({ view, request }: HttpContext) {
    const deliveryStreams = await DeliveryStream.query().where('is_active', true).orderBy('name')
    const techStreams = await TechStream.query().where('is_active', true).orderBy('name')

    const selectedStreamId = request.input('stream') ? Number(request.input('stream')) : undefined
    const selectedTechStreamParam = request.input('techStream')
      ? Number(request.input('techStream'))
      : undefined

    // Resolve window: 'sprint' resolves to sprint start → today; otherwise numeric days
    const windowParam = request.input('window', '30')
    let windowDays: number = 30
    let activeSprintForWindow: typeof Sprint.prototype | null = null

    if (windowParam === 'sprint' && selectedStreamId) {
      activeSprintForWindow = await Sprint.query()
        .where('delivery_stream_id', selectedStreamId)
        .where('state', 'active')
        .first()

      if (activeSprintForWindow) {
        const sprintStart =
          activeSprintForWindow.startDate instanceof Date
            ? DateTime.fromJSDate(activeSprintForWindow.startDate as unknown as Date)
            : DateTime.fromISO(activeSprintForWindow.startDate as unknown as string)
        windowDays = Math.max(1, Math.ceil(DateTime.now().diff(sprintStart, 'days').days))
      }
    } else {
      windowDays = Number(windowParam) || 30
    }

    // Resolve active sprint (for confidence gauge, regardless of window mode)
    const activeSprint =
      activeSprintForWindow ??
      (selectedStreamId
        ? await Sprint.query()
            .where('delivery_stream_id', selectedStreamId)
            .where('state', 'active')
            .first()
        : null)

    // Zone visibility from query param (comma-separated; empty = all visible)
    // request.input may return string or string[] depending on URL encoding
    const zonesRaw = request.input('zones', '')
    const zonesParam = Array.isArray(zonesRaw) ? zonesRaw.join(',') : String(zonesRaw)
    const activeZones: Set<Zone> = zonesParam
      ? new Set(zonesParam.split(',').filter((z): z is Zone => ALL_ZONES.includes(z as Zone)))
      : new Set(ALL_ZONES)

    let selectedStream = null
    if (selectedStreamId) {
      selectedStream = await DeliveryStream.find(selectedStreamId)
    }

    // Resolve selected tech stream (param → fallback to first active)
    const selectedTechStreamId =
      selectedTechStreamParam ?? (techStreams.length > 0 ? techStreams[0].id : null)

    const [wipByStage, cycleTimeStats, flowEfficiency] = await Promise.all([
      new WipMetricsService().compute(selectedStreamId),
      new CycleTimeService().compute(selectedStreamId, windowDays),
      new FlowEfficiencyService().compute(selectedStreamId, windowDays),
    ])

    // Compute PR review turnaround per active tech stream
    const prMetrics = await Promise.all(
      techStreams.map(async (ts) => {
        const turnaround = await new PrReviewTurnaroundService(
          ts.id,
          windowDays,
          ts.minContributors
        ).compute()
        return { techStream: ts, turnaround }
      })
    )

    // Compute DORA metrics — filter to selected tech stream if one is chosen
    const doraTargetStreams = selectedTechStreamParam
      ? techStreams.filter((ts) => ts.id === selectedTechStreamId)
      : techStreams

    const doraMetrics = await Promise.all(
      doraTargetStreams.map(async (ts) => ({
        techStream: ts,
        dora: await new DoraMetricsService(ts.id, windowDays).compute(),
      }))
    )

    // Phase 4: Forecast, Sprint Confidence, Cross-Stream Correlation, Pulse
    const [forecast, sprintConfidence, defectEscape] = await Promise.all([
      selectedStreamId
        ? new MonteCarloForecastService(selectedStreamId).compute()
        : Promise.resolve(null),
      selectedStreamId
        ? new SprintConfidenceService(selectedStreamId).compute()
        : Promise.resolve(null),
      selectedStreamId
        ? new DefectEscapeRateService(selectedStreamId, windowDays).compute()
        : Promise.resolve(null),
    ])

    // Read cross-stream correlations from materialised table; fall back to live if empty
    let crossStreamCorrelations: Array<{
      techStreamId: number
      blockCount14d: number
      impactedDeliveryStreamIds: number[]
      severity: string
      avgConfidencePct: number | null
    }>
    const today = DateTime.now().toISODate()!
    const materialisedRows = await CrossStreamCorrelation.query()
      .where('analysis_date', today)
      .orderBy('block_count_14d', 'desc')

    if (materialisedRows.length > 0) {
      crossStreamCorrelations = materialisedRows.map((r) => ({
        techStreamId: r.techStreamId,
        blockCount14d: r.blockCount14d,
        impactedDeliveryStreamIds: r.impactedDeliveryStreams,
        severity: r.severity,
        avgConfidencePct: r.avgConfidencePct,
      }))
    } else {
      crossStreamCorrelations = await new CrossStreamCorrelationService().computeAll()
    }

    const pulseAggregates = selectedStreamId
      ? await PulseAggregate.query()
          .where('delivery_stream_id', selectedStreamId)
          .orderBy('survey_period', 'desc')
          .limit(6)
      : []

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

    const cycleScatterData = cycleRecords.map((c) => ({
      x: c.completedAt.toISO(),
      y: Number(c.cycleTimeDays),
      ticketId: c.ticketId,
    }))

    // Data quality warnings for selected stream
    const dataQualityWarnings = selectedStreamId
      ? await new DataQualityService().getStreamWarnings(selectedStreamId)
      : []

    // DORA trend time-series for selected tech stream
    const doraTrend = selectedTechStreamId
      ? await new DoraTrendService(selectedTechStreamId, 90).compute()
      : []

    const activeZonesArray = [...activeZones]
    const zoneEntries = ALL_ZONES.map((key) => {
      const isActive = activeZones.has(key)
      let toggleUrl: string
      if (isActive && activeZones.size > 1) {
        toggleUrl = activeZonesArray.filter((z) => z !== key).join(',')
      } else if (isActive) {
        toggleUrl = ''
      } else {
        toggleUrl = [...activeZonesArray, key].join(',')
      }
      return { key, label: ZONE_LABELS[key], toggleUrl }
    })

    return view.render('dashboard/index', {
      deliveryStreams,
      techStreams,
      selectedStream,
      selectedStreamId: selectedStreamId ?? null,
      selectedTechStreamId,
      windowDays,
      windowParam,
      activeSprint,
      activeZones: activeZonesArray,
      zoneEntries,
      zonesParam,
      wipStages,
      cycleTimeStats,
      cycleScatterData,
      flowEfficiency,
      prMetrics,
      doraMetrics,
      forecast,
      sprintConfidence,
      defectEscape,
      crossStreamCorrelations,
      pulseAggregates,
      dataQualityWarnings,
      doraTrend,
    })
  }
}
