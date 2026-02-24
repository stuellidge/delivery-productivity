import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import PlatformSetting from '#models/platform_setting'

export interface RetentionResult {
  table: string
  rowsDeleted: number
}

// Default retention periods in months (spec §8.3)
const DEFAULT_RETENTION: Record<string, number> = {
  work_item_events: 24,
  defect_events: 24,
  pr_events: 24,
  cicd_events: 24,
  incident_events: 24,
  work_item_cycles: 36,
  pr_cycles: 24,
  deployment_records: 24,
  daily_stream_metrics: 36,
  forecast_snapshots: 12,
  pulse_responses: 12,
}

// Maps each table to its primary chronological column
const TIMESTAMP_COLUMNS: Record<string, string> = {
  work_item_events: 'event_timestamp',
  defect_events: 'event_timestamp',
  pr_events: 'event_timestamp',
  cicd_events: 'event_timestamp',
  incident_events: 'occurred_at',
  work_item_cycles: 'completed_at',
  pr_cycles: 'opened_at',
  deployment_records: 'deployed_at',
  daily_stream_metrics: 'metric_date',
  forecast_snapshots: 'computed_at',
  pulse_responses: 'received_at',
}

export default class DataRetentionService {
  async run(): Promise<RetentionResult[]> {
    const config = await PlatformSetting.get<Record<string, number>>(
      'data_retention_months',
      DEFAULT_RETENTION
    )

    const effectiveConfig = { ...DEFAULT_RETENTION, ...config }
    const results: RetentionResult[] = []

    for (const [table, months] of Object.entries(effectiveConfig)) {
      const timestampCol = TIMESTAMP_COLUMNS[table]
      if (!timestampCol) continue

      const cutoff = DateTime.now().minus({ months }).toISO()!
      const count = await db.from(table).where(timestampCol, '<', cutoff).delete()
      results.push({ table, rowsDeleted: Number(count) })
    }

    // Store as JSON-serialized string (JSONB column; PlatformSetting.prepare passes
    // through strings as-is, so we must pre-serialize with JSON.stringify)
    await PlatformSetting.updateOrCreate(
      { key: 'last_data_retention_run' },
      {
        value: JSON.stringify(DateTime.now().toISO()!),
        description: 'Last time the data retention job ran',
      }
    )

    return results
  }
}
