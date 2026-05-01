import type { HttpContext } from '@adonisjs/core/http'
import IncidentEventService from '#services/incident_event_service'
import { incidentEventValidator } from '#validators/incident_event_validator'

export default class IncidentEventsController {
  async handle({ request, response }: HttpContext) {
    const payload = await request.validateUsing(incidentEventValidator)
    const service = new IncidentEventService(payload)
    await service.process()
    return response.status(202).send({ ok: true })
  }
}
