import { BaseSeeder } from '@adonisjs/lucid/seeders'
import PlatformSetting from '#models/platform_setting'

/**
 * Seeds platform settings with sensible demo defaults.
 * Development environment only — will not run in test or production.
 */
export default class PlatformSettingsSeeder extends BaseSeeder {
  static environment = ['development']

  async run() {
    const settings = [
      {
        key: 'cross_stream_severity_thresholds',
        description: 'Thresholds for cross-stream alert severity levels',
        value: {
          lowBlockCountThreshold: 2,
          mediumBlockCountThreshold: 5,
          highBlockCountThreshold: 10,
          lowConfidenceThreshold: 60,
          mediumConfidenceThreshold: 40,
        },
      },
      {
        key: 'alert_notification_channels',
        description: 'Slack webhook and severity filter for alert notifications',
        value: {
          slackWebhookUrl: '',
          minimumSeverity: 'MEDIUM',
        },
      },
      {
        key: 'last_alert_notification',
        description: 'Deduplication state for alert notifications (managed by system)',
        value: { conditions: [] },
      },
    ]

    for (const s of settings) {
      await PlatformSetting.updateOrCreate({ key: s.key }, s)
    }
  }
}
