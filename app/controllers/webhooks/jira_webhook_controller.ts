import type { HttpContext } from '@adonisjs/core/http'
import EventQueueService from '#services/event_queue_service'

export default class JiraWebhookController {
  async handle({ request, response }: HttpContext) {
    const payload = request.body() as Record<string, unknown>
    const svc = new EventQueueService()
    await svc.enqueue('jira', payload)
    return response.status(202).send({ ok: true })
  }
}
