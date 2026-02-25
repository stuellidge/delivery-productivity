import type { HttpContext } from '@adonisjs/core/http'
import JiraEventNormalizerService, {
  InvalidSignatureError,
} from '#services/jira_event_normalizer_service'
import EventQueueService from '#services/event_queue_service'

export default class JiraWebhookController {
  async handle({ request, response }: HttpContext) {
    const signature = request.header('x-hub-signature-256')
    const payload = request.body() as Record<string, unknown>

    if (signature) {
      const checker = new JiraEventNormalizerService(payload as any, undefined, signature)
      try {
        checker.checkSignature()
      } catch (error) {
        if (error instanceof InvalidSignatureError) {
          return response.unauthorized({ error: 'Invalid signature' })
        }
        throw error
      }
    }

    const svc = new EventQueueService()
    await svc.enqueue('jira', payload)
    return response.status(202).send({ ok: true })
  }
}
