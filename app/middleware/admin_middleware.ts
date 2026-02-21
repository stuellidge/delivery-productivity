import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

/**
 * AdminMiddleware requires the authenticated user to have the platform_admin role.
 * Redirects non-admins to the dashboard.
 */
export default class AdminMiddleware {
  async handle({ auth, response }: HttpContext, next: NextFn) {
    const user = auth.user!
    const isAdmin = await user.isAdmin()

    if (!isAdmin) {
      return response.redirect('/dashboard')
    }

    return next()
  }
}
