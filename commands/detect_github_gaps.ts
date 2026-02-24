import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import GithubGapDetectionService from '#services/github_gap_detection_service'

export default class DetectGithubGaps extends BaseCommand {
  static commandName = 'scheduler:detect-github-gaps'
  static description = 'Detect and backfill missed GitHub PR events from the last 7 days'
  static options: CommandOptions = { startApp: true }

  async run() {
    this.logger.info('Detecting GitHub webhook gaps…')
    const { checked, backfilled } = await new GithubGapDetectionService().run()
    this.logger.success(`Gap detection complete — checked: ${checked}, backfilled: ${backfilled}`)
  }
}
