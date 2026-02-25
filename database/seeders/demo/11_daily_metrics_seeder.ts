import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { DateTime } from 'luxon'
import DailyStreamMetric from '#models/daily_stream_metric'
import TechStream from '#models/tech_stream'

/**
 * Seeds daily materialised DORA metrics for the last 90 days.
 * This pre-populates the trend chart immediately without needing to run
 * the materialisation scheduler command first.
 *
 * Data follows a realistic improvement trajectory:
 *   - Deployment frequency: 4–6/week
 *   - CFR: starting at ~12%, improving to ~5%
 *   - TTR median: 40–70 min
 *   - Lead time P50: 10–16 hrs
 *
 * Development environment only — will not run in test or production.
 */
export default class DailyMetricsSeeder extends BaseSeeder {
  static environment = ['development']

  async run() {
    const backend = await TechStream.findByOrFail('github_org', 'acme-demo')
    const frontend = await TechStream.findByOrFail('github_org', 'acme-demo-fe')

    const now = DateTime.now().startOf('day')

    // Generate 90 days of daily metrics, one row per (stream, metric_name, date)
    // We only seed one value per week (the service buckets into weeks when reading)
    // to keep the seeder lean — seed every 7 days
    for (let week = 12; week >= 0; week--) {
      const metricDate = now.minus({ weeks: week }).toISODate()!

      // ── Platform Backend ──────────────────────────────────────────────────
      // Trend: frequency improving, CFR falling, lead time stabilising
      const weekProgress = (12 - week) / 12 // 0 = oldest, 1 = most recent

      // Deployment frequency: 3 → 5 per week (gradual improvement)
      const backendFreq = 3 + weekProgress * 2
      // CFR: 12% → 5% (improving)
      const backendCfr = 12 - weekProgress * 7
      // TTR: 65 → 40 min (improving)
      const backendTtr = 65 - weekProgress * 25
      // Lead time P50: 16 → 10 hrs (improving)
      const backendLtP50 = 16 - weekProgress * 6
      // Lead time P85: 26 → 18 hrs
      const backendLtP85 = 26 - weekProgress * 8

      // [metricName, value, unit, percentile, sampleSize]
      const backendRows: [string, number, string, number | null, number][] = [
        ['deployment_frequency', Math.round(backendFreq * 10) / 10, 'deploys_per_week', null, 7],
        ['change_failure_rate', Math.round(backendCfr * 10) / 10, 'percent', null, 7],
        ['ttr_median', Math.round(backendTtr), 'minutes', 50, 6],
        ['lead_time_p50', Math.round(backendLtP50 * 10) / 10, 'hours', 50, 28],
        ['lead_time_p85', Math.round(backendLtP85 * 10) / 10, 'hours', 85, 28],
      ]

      for (const [metricName, metricValue, metricUnit, percentile, sampleSize] of backendRows) {
        await DailyStreamMetric.updateOrCreate(
          { streamType: 'tech', streamId: backend.id, metricName, metricDate, percentile },
          { streamType: 'tech', streamId: backend.id, metricName, metricDate, metricValue, metricUnit, percentile, sampleSize }
        )
      }

      // ── Frontend ──────────────────────────────────────────────────────────
      // Smaller team, lower deploy frequency but stable
      const feFreq = 1.5 + weekProgress * 0.5
      const feCfr = 6 - weekProgress * 2
      const feTtr = 50 - weekProgress * 15
      const feLtP50 = 12 - weekProgress * 3
      const feLtP85 = 20 - weekProgress * 5

      const frontendRows: [string, number, string, number | null, number][] = [
        ['deployment_frequency', Math.round(feFreq * 10) / 10, 'deploys_per_week', null, 7],
        ['change_failure_rate', Math.round(feCfr * 10) / 10, 'percent', null, 7],
        ['ttr_median', Math.round(feTtr), 'minutes', 50, 4],
        ['lead_time_p50', Math.round(feLtP50 * 10) / 10, 'hours', 50, 10],
        ['lead_time_p85', Math.round(feLtP85 * 10) / 10, 'hours', 85, 10],
      ]

      for (const [metricName, metricValue, metricUnit, percentile, sampleSize] of frontendRows) {
        await DailyStreamMetric.updateOrCreate(
          { streamType: 'tech', streamId: frontend.id, metricName, metricDate, percentile },
          { streamType: 'tech', streamId: frontend.id, metricName, metricDate, metricValue, metricUnit, percentile, sampleSize }
        )
      }
    }
  }
}
