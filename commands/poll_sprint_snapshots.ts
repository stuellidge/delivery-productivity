import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import JiraSprintPollerService from '#services/jira_sprint_poller_service'

export default class PollSprintSnapshots extends BaseCommand {
  static commandName = 'scheduler:poll-sprint-snapshots'
  static description = 'Poll Jira for active sprint state and upsert SprintSnapshot records'
  static options: CommandOptions = { startApp: true }

  async run() {
    this.logger.info('Polling sprint snapshots from Jira…')
    await new JiraSprintPollerService().run()
    this.logger.success('Sprint snapshot polling complete')
  }
}
