import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

const MAX_ATTEMPTS = 10
const WINDOW_MS = 15 * 60 * 1000 // 15 minutes

interface ThrottleEntry {
  count: number
  resetAt: number
}

export const throttleState = new Map<string, ThrottleEntry>()

export default class LoginThrottleMiddleware {
  async handle({ request, response }: HttpContext, next: NextFn) {
    const ip = request.ip()
    const now = Date.now()

    const entry = throttleState.get(ip)

    if (entry && now < entry.resetAt) {
      entry.count += 1
      if (entry.count > MAX_ATTEMPTS) {
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
        return response
          .status(429)
          .header('Retry-After', String(retryAfter))
          .send({ error: 'Too many login attempts. Please try again later.' })
      }
    } else {
      throttleState.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    }

    await next()
  }
}
