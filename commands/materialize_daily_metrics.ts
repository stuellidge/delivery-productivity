import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import DailyMetricsMaterializationService from '#services/daily_metrics_materialization_service'

export default class MaterializeDailyMetrics extends BaseCommand {
  static commandName = 'scheduler:materialize-daily-metrics'
  static description = 'Materialise all stream metrics into daily_stream_metrics for today'
  static options: CommandOptions = { startApp: true }

  async run() {
    this.logger.info('Materialising daily stream metrics…')
    const count = await new DailyMetricsMaterializationService().run()
    this.logger.success(`Done — ${count} row(s) written/updated for today`)
  }
}
