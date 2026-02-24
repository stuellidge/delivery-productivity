import type { HttpContext } from '@adonisjs/core/http'
import PrEvent from '#models/pr_event'
import PrCycle from '#models/pr_cycle'
import PrDeliveryStreamEnrichmentService from '#services/pr_delivery_stream_enrichment_service'

export default class PrLinkController {
  async handle({ params, request, response }: HttpContext) {
    const prEvent = await PrEvent.find(params.id)
    if (!prEvent) {
      return response.notFound({
        status: 'error',
        error: { code: 'not_found', message: 'PR event not found' },
      })
    }

    const ticketId = request.input('ticket_id')
    if (!ticketId) {
      return response.unprocessableEntity({
        status: 'error',
        error: { code: 'validation_error', message: 'ticket_id is required' },
      })
    }

    await prEvent.merge({ linkedTicketId: String(ticketId) }).save()

    // Also update the corresponding pr_cycle if one exists
    const cycle = await PrCycle.query()
      .where('repo_id', prEvent.repoId)
      .where('pr_number', prEvent.prNumber)
      .first()
    if (cycle) await cycle.merge({ linkedTicketId: String(ticketId) }).save()

    // Enrich deliveryStreamId now that the ticket link is known
    await new PrDeliveryStreamEnrichmentService().enrichByTicketId(String(ticketId))

    return response.ok({
      status: 'ok',
      data: { prEventId: prEvent.id, linkedTicketId: ticketId },
    })
  }
}
