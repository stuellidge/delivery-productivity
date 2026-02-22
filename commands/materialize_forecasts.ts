import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import DeliveryStream from '#models/delivery_stream'
import MonteCarloForecastService from '#services/monte_carlo_forecast_service'

export default class MaterializeForecasts extends BaseCommand {
  static commandName = 'scheduler:materialize-forecasts'
  static description = 'Materialise Monte Carlo forecast snapshots into the DB for today'
  static options: CommandOptions = { startApp: true }

  async run() {
    this.logger.info('Materialising forecast snapshots…')
    const deliveryStreams = await DeliveryStream.query().where('is_active', true)
    for (const ds of deliveryStreams) {
      await new MonteCarloForecastService(ds.id).materialize()
    }
    this.logger.success(`Done — ${deliveryStreams.length} stream(s) processed`)
  }
}
