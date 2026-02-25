import type { HttpContext } from '@adonisjs/core/http'
import DeploymentEventService from '#services/deployment_event_service'

export default class DeploymentEventsController {
  async handle({ request, response }: HttpContext) {
    const service = new DeploymentEventService(request.body())
    await service.process()
    return response.status(202).send({ ok: true })
  }
}
