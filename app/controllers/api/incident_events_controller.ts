import type { HttpContext } from '@adonisjs/core/http'
import IncidentEventService from '#services/incident_event_service'

export default class IncidentEventsController {
  async handle({ request, response }: HttpContext) {
    const service = new IncidentEventService(request.body())
    await service.process()
    return response.status(202).send({ ok: true })
  }
}
