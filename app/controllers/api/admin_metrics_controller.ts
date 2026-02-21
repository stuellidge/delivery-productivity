import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import DataQualityService from '#services/data_quality_service'
import IntegrationHealthService from '#services/integration_health_service'
import SystemMonitoringService from '#services/system_monitoring_service'

export default class AdminMetricsController {
  async dataQuality({ response }: HttpContext) {
    const metrics = await new DataQualityService().compute()

    return response.ok({
      status: 'ok',
      data: metrics,
      meta: {
        computed_at: DateTime.now().toISO(),
      },
    })
  }

  async integrationHealth({ response }: HttpContext) {
    const health = await new IntegrationHealthService().getHealth()

    return response.ok({
      status: 'ok',
      data: health,
      meta: {
        computed_at: DateTime.now().toISO(),
      },
    })
  }

  async systemAlerts({ response }: HttpContext) {
    const alerts = await new SystemMonitoringService().getActiveAlerts()

    return response.ok({
      status: 'ok',
      data: { alerts },
      meta: {
        computed_at: DateTime.now().toISO(),
      },
    })
  }
}
