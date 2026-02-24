import type { HttpContext } from '@adonisjs/core/http'
import IntegrationHealthService from '#services/integration_health_service'
import EventArchiveService from '#services/event_archive_service'
import PlatformSetting from '#models/platform_setting'

export default class IntegrationHealthController {
  async index({ view }: HttpContext) {
    const [health, lastRetentionRun, lastArchiveRun] = await Promise.all([
      new IntegrationHealthService().getHealth(),
      PlatformSetting.get<string | null>('last_data_retention_run', null),
      new EventArchiveService().lastWriteTime(),
    ])

    return view.render('admin/integration_health/index', {
      health,
      lastRetentionRun,
      lastArchiveRun: lastArchiveRun?.toISO() ?? null,
    })
  }
}
