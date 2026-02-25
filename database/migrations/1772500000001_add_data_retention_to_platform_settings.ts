import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.defer(async (db) => {
      await db.table('platform_settings').insert({
        key: 'data_retention_months',
        value: JSON.stringify({
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
        }),
        description:
          'Data retention periods in months per table (spec §8.3). Merged with service defaults.',
      })
    })
  }

  async down() {
    this.defer(async (db) => {
      await db.from('platform_settings').where('key', 'data_retention_months').delete()
    })
  }
}
