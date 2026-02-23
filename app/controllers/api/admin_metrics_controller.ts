import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import logger from '@adonisjs/core/services/logger'
import DataQualityService from '#services/data_quality_service'
import IntegrationHealthService from '#services/integration_health_service'
import SystemMonitoringService from '#services/system_monitoring_service'
import JiraBackfillService from '#services/jira_backfill_service'
import GitHubBackfillService from '#services/github_backfill_service'

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
    const validSources = ['jira', 'github'] as const
    if (!validSources.includes(params.source)) {
      return response.unprocessableEntity({
        status: 'error',
        error: { code: 'VALIDATION_ERROR', message: 'source must be jira or github' },
      })
    }

    const { source, org } = params

    if (source === 'jira') {
      setImmediate(() => new JiraBackfillService(org).run().catch((err) => logger.error(err)))
    } else {
      setImmediate(() => new GitHubBackfillService(org).run().catch((err) => logger.error(err)))
    }

    logger.info({ source, org }, 'Backfill started')

    return response.status(202).send({
      status: 'ok',
      data: { message: `Backfill started for ${source}/${org}` },
      meta: { source, org, queued_at: DateTime.now().toISO() },
    })
  }
}
