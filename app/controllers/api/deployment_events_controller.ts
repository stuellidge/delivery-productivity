import type { HttpContext } from '@adonisjs/core/http'
import DeploymentEventService from '#services/deployment_event_service'
import { deploymentEventValidator } from '#validators/deployment_event_validator'

export default class DeploymentEventsController {
  async handle({ request, response }: HttpContext) {
    const payload = await request.validateUsing(deploymentEventValidator)
    const service = new DeploymentEventService(payload)
    await service.process()
    return response.status(202).send({ ok: true })
  }
}
