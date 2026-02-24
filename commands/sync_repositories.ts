import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import GithubRepoSyncService from '#services/github_repo_sync_service'

export default class SyncRepositories extends BaseCommand {
  static commandName = 'scheduler:sync-repositories'
  static description = 'Sync repository list from GitHub orgs into the repositories table'
  static options: CommandOptions = { startApp: true }

  async run() {
    this.logger.info('Syncing repositories from GitHub…')
    await new GithubRepoSyncService().run()
    this.logger.success('Repository sync complete')
  }
}
