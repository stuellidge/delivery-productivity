import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import CrossStreamCorrelationService from '#services/cross_stream_correlation_service'

export default class MaterializeCrossStream extends BaseCommand {
  static commandName = 'scheduler:materialize-cross-stream'
  static description = 'Materialise cross-stream correlation results into the DB for today'
  static options: CommandOptions = { startApp: true }

  async run() {
    this.logger.info('Materialising cross-stream correlations…')
    const rows = await new CrossStreamCorrelationService().materializeAll()
    this.logger.success(`Done — ${rows.length} row(s) written for today`)
  }
}
