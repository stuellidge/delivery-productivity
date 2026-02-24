import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import PrEvent from '#models/pr_event'
import PrCycle from '#models/pr_cycle'
import PrDeliveryStreamEnrichmentService from '#services/pr_delivery_stream_enrichment_service'
import logger from '@adonisjs/core/services/logger'

const linkValidator = vine.compile(
  vine.object({
    ticketId: vine.string().trim().minLength(1).maxLength(50),
  })
)

export default class UnlinkedPrsController {
  async index({ view, request }: HttpContext) {
    const page = Number(request.input('page', 1))
    const perPage = 50

    const prs = await PrEvent.query()
      .whereNull('linked_ticket_id')
      .where('event_type', 'opened')
      .orderBy('event_timestamp', 'desc')
      .paginate(page, perPage)

    return view.render('admin/unlinked_prs/index', { prs })
  }

  async link({ params, request, response, session }: HttpContext) {
    const pr = await PrEvent.findOrFail(params.id)

    let ticketId: string
    try {
      const data = await request.validateUsing(linkValidator)
      ticketId = data.ticketId
    } catch {
      session.flash('errors', { ticketId: 'Ticket ID is required' })
      return response.redirect('/admin/data-quality/unlinked-prs')
    }

    pr.linkedTicketId = ticketId
    await pr.save()

    // Also update the associated pr_cycle row if one exists
    try {
      const cycle = await PrCycle.query()
        .where('repo_id', pr.repoId ?? 0)
        .where('pr_number', pr.prNumber)
        .first()

      if (cycle) {
        cycle.linkedTicketId = ticketId
        await cycle.save()
      }
    } catch (error) {
      logger.warn({ err: error }, 'Could not update pr_cycle linked_ticket_id')
    }

    // Enrich deliveryStreamId now that the ticket link is known
    try {
      await new PrDeliveryStreamEnrichmentService().enrichByTicketId(ticketId)
    } catch (error) {
      logger.warn({ err: error }, 'Could not enrich deliveryStreamId after linking PR')
    }

    session.flash('success', `PR #${pr.prNumber} linked to ${ticketId}`)
    return response.redirect('/admin/data-quality/unlinked-prs')
  }
}
