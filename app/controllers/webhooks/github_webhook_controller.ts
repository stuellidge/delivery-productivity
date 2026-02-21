import type { HttpContext } from '@adonisjs/core/http'
import GithubEventNormalizerService, {
  InvalidSignatureError,
} from '#services/github_event_normalizer_service'

export default class GithubWebhookController {
  async handle({ request, response }: HttpContext) {
    const eventType = request.header('x-github-event')
    const signature = request.header('x-hub-signature-256')
    const payload = request.body() as Record<string, any>

    const service = new GithubEventNormalizerService(payload, eventType, signature ?? undefined)

    try {
      await service.process()
    } catch (error) {
      if (error instanceof InvalidSignatureError) {
        return response.unauthorized({ error: 'Invalid signature' })
      }
      throw error
    }

    return response.ok({ ok: true })
  }
}
