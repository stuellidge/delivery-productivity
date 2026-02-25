import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import DataRetentionService from '#services/data_retention_service'

export default class EnforceDataRetention extends BaseCommand {
  static commandName = 'scheduler:enforce-data-retention'
  static description = 'Delete rows older than their configured retention period (spec §8.3)'
  static options: CommandOptions = { startApp: true }

  async run() {
    const results = await new DataRetentionService().run()
    const total = results.reduce((sum, r) => sum + r.rowsDeleted, 0)

    for (const { table, rowsDeleted } of results) {
      if (rowsDeleted > 0) {
        this.logger.info(`  ${table}: ${rowsDeleted} row(s) deleted`)
      }
    }

    this.logger.success(`Done — ${total} total row(s) deleted across ${results.length} table(s)`)
  }
}
