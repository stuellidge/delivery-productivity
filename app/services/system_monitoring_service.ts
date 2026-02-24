import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import IntegrationHealthService from '#services/integration_health_service'
import PlatformSetting from '#models/platform_setting'

export interface AlertCondition {
  condition: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  message: string
  value?: number
  threshold?: number
}

const DEPLOYMENT_TRACEABILITY_TARGET = 80
const PULSE_RESPONSE_RATE_TARGET = 40
const QUEUE_DEPTH_THRESHOLD = 1000

const SEVERITY_ORDER: AlertCondition['severity'][] = ['low', 'medium', 'high', 'critical']

export default class SystemMonitoringService {
  async getActiveAlerts(): Promise<AlertCondition[]> {
    const alerts: AlertCondition[] = []

    const [traceabilityAlerts, pulseAlerts, integrationAlerts, queueAlerts] = await Promise.all([
      this.checkDeploymentTraceability(),
      this.checkPulseResponseRate(),
      this.checkIntegrationHealth(),
      this.checkQueueDepth(),
    ])

    alerts.push(...traceabilityAlerts, ...pulseAlerts, ...integrationAlerts, ...queueAlerts)
    return alerts
  }

  async notify(): Promise<void> {
    const channelsSetting = await PlatformSetting.findBy('key', 'alert_notification_channels')
    if (!channelsSetting) return

    const channels = channelsSetting.value as {
      slackWebhookUrl?: string
      minimumSeverity?: string
    }
    const { slackWebhookUrl, minimumSeverity = 'low' } = channels

    if (!slackWebhookUrl) return

    const allAlerts = await this.getActiveAlerts()

    // Filter by minimum severity
    const minIdx = SEVERITY_ORDER.indexOf(minimumSeverity as AlertCondition['severity'])
    const filteredAlerts = allAlerts.filter(
      (a) => SEVERITY_ORDER.indexOf(a.severity) >= (minIdx === -1 ? 0 : minIdx)
    )

    if (filteredAlerts.length === 0) return

    // Deduplication: skip if all current alerts were already notified
    const lastNotifSetting = await PlatformSetting.findBy('key', 'last_alert_notification')
    const lastConditions: string[] = lastNotifSetting
      ? (lastNotifSetting.value as { conditions: string[] }).conditions
      : []

    const newAlerts = filteredAlerts.filter((a) => !lastConditions.includes(a.condition))
    if (newAlerts.length === 0) return

    // Build Slack blocks
    const blocks = this.buildSlackBlocks(filteredAlerts)

    await fetch(slackWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks }),
    })

    // Persist notification state for deduplication
    await PlatformSetting.updateOrCreate(
      { key: 'last_alert_notification' },
      { value: JSON.stringify({ conditions: filteredAlerts.map((a) => a.condition) }) }
    )
  }

  private buildSlackBlocks(alerts: AlertCondition[]): object[] {
    const blocks: object[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `Delivery Productivity Alerts (${DateTime.now().toFormat('yyyy-MM-dd HH:mm')})`,
        },
      },
    ]

    for (const alert of alerts) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${alert.severity.toUpperCase()}* | \`${alert.condition}\`\n${alert.message}`,
        },
      })
    }

    return blocks
  }

  private async checkDeploymentTraceability(): Promise<AlertCondition[]> {
    const [totalRow] = await db
      .from('deployment_records')
      .where('environment', 'production')
      .count('* as total')
    const [traceableRow] = await db
      .from('deployment_records')
      .where('environment', 'production')
      .whereNotNull('linked_ticket_id')
      .count('* as traceable')

    const total = Number(totalRow.total)
    if (total === 0) return []

    const traceable = Number(traceableRow.traceable)
    const rate = (traceable / total) * 100

    if (rate < DEPLOYMENT_TRACEABILITY_TARGET) {
      return [
        {
          condition: 'deployment_traceability_low',
          severity: 'low',
          message: `Deployment traceability is ${rate.toFixed(1)}% (target: ${DEPLOYMENT_TRACEABILITY_TARGET}%)`,
          value: rate,
          threshold: DEPLOYMENT_TRACEABILITY_TARGET,
        },
      ]
    }
    return []
  }

  private async checkPulseResponseRate(): Promise<AlertCondition[]> {
    // Get current survey period
    const currentPeriod = DateTime.now().toFormat('yyyy-MM')

    const [responseRow] = await db
      .from('pulse_responses')
      .where('survey_period', currentPeriod)
      .count('* as responses')

    const [teamSizeRow] = await db
      .from('delivery_streams')
      .where('is_active', true)
      .whereNotNull('team_size')
      .sum('team_size as total_team_size')

    const responses = Number(responseRow.responses)
    const teamSize = Number(teamSizeRow.total_team_size) || 0

    if (teamSize === 0) return []

    const rate = (responses / teamSize) * 100

    if (rate < PULSE_RESPONSE_RATE_TARGET) {
      return [
        {
          condition: 'pulse_response_rate_low',
          severity: 'low',
          message: `Pulse survey response rate is ${rate.toFixed(1)}% (target: ${PULSE_RESPONSE_RATE_TARGET}%)`,
          value: rate,
          threshold: PULSE_RESPONSE_RATE_TARGET,
        },
      ]
    }
    return []
  }

  private async checkIntegrationHealth(): Promise<AlertCondition[]> {
    const health = await new IntegrationHealthService().getHealth()
    const stale = health.webhookSources.filter((s) => s.status === 'stale')

    return stale.map((s) => ({
      condition: `integration_stale_${s.source}`,
      severity: 'medium' as const,
      message: `${s.source} integration has not received events in the last 2 hours`,
    }))
  }

  private async checkQueueDepth(): Promise<AlertCondition[]> {
    const [row] = await db.from('event_queue').where('status', 'pending').count('* as total')

    const total = Number(row.total)
    if (total >= QUEUE_DEPTH_THRESHOLD) {
      return [
        {
          condition: 'event_queue_depth_high',
          severity: 'high',
          message: `Event queue has ${total} pending rows (threshold: ${QUEUE_DEPTH_THRESHOLD})`,
          value: total,
          threshold: QUEUE_DEPTH_THRESHOLD,
        },
      ]
    }
    return []
  }
}
