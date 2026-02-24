import logger from '@adonisjs/core/services/logger'
import WorkItemEvent from '#models/work_item_event'
import PrEvent from '#models/pr_event'
import PrCycle from '#models/pr_cycle'
import db from '@adonisjs/lucid/services/db'

export default class PrDeliveryStreamEnrichmentService {
  /**
   * Looks up the delivery stream for a linked ticket and propagates it to all
   * PrEvent and PrCycle rows that share the same linkedTicketId but have no
   * deliveryStreamId yet.
   *
   * Returns the number of PrEvent rows updated (0 if nothing to update or the
   * ticket has no associated delivery stream).
   */
  async enrichByTicketId(linkedTicketId: string): Promise<number> {
    const event = await WorkItemEvent.query()
      .where('ticket_id', linkedTicketId)
      .whereNotNull('delivery_stream_id')
      .orderBy('event_timestamp', 'asc')
      .first()

    if (!event || event.deliveryStreamId === null) {
      return 0
    }

    const deliveryStreamId = event.deliveryStreamId

    const updatedCount = await PrEvent.query()
      .where('linked_ticket_id', linkedTicketId)
      .whereNull('delivery_stream_id')
      .update({ delivery_stream_id: deliveryStreamId })

    await PrCycle.query()
      .where('linked_ticket_id', linkedTicketId)
      .whereNull('delivery_stream_id')
      .update({ delivery_stream_id: deliveryStreamId })

    return Number(updatedCount)
  }

  /**
   * Finds all PrEvents that have a linkedTicketId but no deliveryStreamId,
   * groups them by ticket, and calls enrichByTicketId for each distinct ticket.
   *
   * Returns the total number of PrEvent rows enriched.
   */
  async enrichAllPending(): Promise<number> {
    const rows = await db
      .from('pr_events')
      .whereNotNull('linked_ticket_id')
      .whereNull('delivery_stream_id')
      .select(db.raw('DISTINCT linked_ticket_id'))

    if (rows.length === 0) return 0

    let total = 0

    for (const row of rows) {
      const ticketId: string = row.linked_ticket_id
      try {
        const count = await this.enrichByTicketId(ticketId)
        total += count
      } catch (err) {
        logger.warn({ err, ticketId }, 'PrDeliveryStreamEnrichmentService: failed for ticket')
      }
    }

    return total
  }
}
