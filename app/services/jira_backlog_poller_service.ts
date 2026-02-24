import { DateTime } from 'luxon'
import logger from '@adonisjs/core/services/logger'
import Sprint from '#models/sprint'

export default class JiraBacklogPollerService {
  async run(): Promise<void> {
    const today = DateTime.now().toISODate()!

    // Activate future sprints whose start date has arrived
    const toActivate = await Sprint.query().where('state', 'future').where('start_date', '<=', today)
    for (const sprint of toActivate) {
      sprint.state = 'active'
      await sprint.save()
    }

    // Close active sprints whose end date has passed
    const toClose = await Sprint.query().where('state', 'active').where('end_date', '<', today)
    for (const sprint of toClose) {
      sprint.state = 'closed'
      await sprint.save()
    }

    logger.info(
      { activated: toActivate.length, closed: toClose.length },
      'Sprint state update completed'
    )
  }
}
