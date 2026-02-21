import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'
import IntegrationHealthService from '#services/integration_health_service'

export interface AlertCondition {
  condition: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  message: string
  value?: number
  threshold?: number
}

const DEPLOYMENT_TRACEABILITY_TARGET = 80
const PULSE_RESPONSE_RATE_TARGET = 40

export default class SystemMonitoringService {
  async getActiveAlerts(): Promise<AlertCondition[]> {
    const alerts: AlertCondition[] = []

    const [traceabilityAlerts, pulseAlerts, integrationAlerts] = await Promise.all([
      this.checkDeploymentTraceability(),
      this.checkPulseResponseRate(),
      this.checkIntegrationHealth(),
    ])

    alerts.push(...traceabilityAlerts, ...pulseAlerts, ...integrationAlerts)
    return alerts
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
}
