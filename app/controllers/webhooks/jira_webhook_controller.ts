import type { HttpContext } from '@adonisjs/core/http'
import JiraEventNormalizerService from '#services/jira_event_normalizer_service'
import type { JiraWebhookPayload } from '#services/jira_event_normalizer_service'

export default class JiraWebhookController {
  async handle({ request, response }: HttpContext) {
    const payload = request.body() as JiraWebhookPayload
    const service = new JiraEventNormalizerService(payload)
    await service.process()
    return response.ok({ ok: true })
  }
}
