import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import DataQualityService from '#services/data_quality_service'

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
}
