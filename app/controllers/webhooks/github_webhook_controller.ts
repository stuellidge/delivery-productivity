import type { HttpContext } from '@adonisjs/core/http'
import GithubEventNormalizerService, {
  InvalidSignatureError,
} from '#services/github_event_normalizer_service'
import EventQueueService from '#services/event_queue_service'

export default class GithubWebhookController {
  async handle({ request, response }: HttpContext) {
    const eventType = request.header('x-github-event')
    const signature = request.header('x-hub-signature-256')
    const payload = request.body() as Record<string, any>

    // Validate signature before enqueueing (return 401 immediately if invalid)
    if (signature) {
      const checker = new GithubEventNormalizerService(payload, eventType, signature)
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
    await svc.enqueue('github', payload, eventType ?? undefined, signature ?? undefined)
    return response.status(202).send({ ok: true })
  }
}
