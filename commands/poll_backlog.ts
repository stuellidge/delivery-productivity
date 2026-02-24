import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import JiraBacklogPollerService from '#services/jira_backlog_poller_service'

export default class PollBacklog extends BaseCommand {
  static commandName = 'scheduler:poll-backlog'
  static description = 'Update sprint states (future→active, active→closed) based on dates'
  static options: CommandOptions = { startApp: true }

  async run() {
    this.logger.info('Updating sprint states…')
    await new JiraBacklogPollerService().run()
    this.logger.success('Sprint state update complete')
  }
}
