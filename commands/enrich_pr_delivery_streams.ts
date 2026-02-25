import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import PrDeliveryStreamEnrichmentService from '#services/pr_delivery_stream_enrichment_service'

export default class EnrichPrDeliveryStreams extends BaseCommand {
  static commandName = 'scheduler:enrich-pr-delivery-streams'
  static description =
    'Back-fill deliveryStreamId on pr_events and pr_cycles linked to Jira tickets'
  static options: CommandOptions = { startApp: true }

  async run() {
    this.logger.info('Enriching PR delivery streams…')
    const count = await new PrDeliveryStreamEnrichmentService().enrichAllPending()
    this.logger.success(`Enriched ${count} PR event(s)`)
  }
}
