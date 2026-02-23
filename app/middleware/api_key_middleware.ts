import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import { createHash } from 'node:crypto'
import { DateTime } from 'luxon'
import ApiKey from '#models/api_key'

export default class ApiKeyMiddleware {
  async handle({ request, response }: HttpContext, next: NextFn) {
    const authHeader = request.header('Authorization')

    if (!authHeader?.startsWith('Bearer ')) {
      return response.unauthorized({
        status: 'error',
        error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' },
      })
    }

    const rawKey = authHeader.slice(7)
    const keyHash = createHash('sha256').update(rawKey).digest('hex')

    const apiKey = await ApiKey.query()
      .where('key_hash', keyHash)
      .where('is_active', true)
      .where((q) => {
        q.whereNull('expires_at').orWhere('expires_at', '>', DateTime.now().toSQL()!)
      })
      .first()

    if (!apiKey) {
      return response.unauthorized({
        status: 'error',
        error: { code: 'UNAUTHORIZED', message: 'Invalid or expired API key' },
      })
    }

    apiKey.lastUsedAt = DateTime.now()
    await apiKey.save()

    if (apiKey.streamScope) {
      const scope = apiKey.streamScope as {
        deliveryStreamIds?: number[]
        techStreamIds?: number[]
      }

      const streamParam = request.input('stream')
      if (streamParam && scope.deliveryStreamIds) {
        if (!scope.deliveryStreamIds.includes(Number(streamParam))) {
          return response.forbidden({
            status: 'error',
            error: { code: 'FORBIDDEN', message: 'Stream not in key scope' },
          })
        }
      }

      const techStreamParam = request.input('techStream')
      if (techStreamParam && scope.techStreamIds) {
        if (!scope.techStreamIds.includes(Number(techStreamParam))) {
          return response.forbidden({
            status: 'error',
            error: { code: 'FORBIDDEN', message: 'Tech stream not in key scope' },
          })
        }
      }
    }

    await next()
  }
}
