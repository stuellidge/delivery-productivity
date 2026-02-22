import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import vine from '@vinejs/vine'
import logger from '@adonisjs/core/services/logger'
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

  async backfill({ params, response }: HttpContext) {
    const backfillValidator = vine.compile(
      vine.object({ source: vine.enum(['jira', 'github'] as const) })
    )
    await backfillValidator.validate({ source: params.source })

    logger.info({ source: params.source, org: params.org }, 'Backfill requested — queued (stub)')

    return response.status(202).send({
      status: 'ok',
      data: { message: `Backfill queued for ${params.source}/${params.org}` },
      meta: { source: params.source, org: params.org, queued_at: DateTime.now().toISO() },
    })
  }
}
