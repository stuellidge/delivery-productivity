import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import { loginValidator } from '#validators/auth_validator'
import env from '#start/env'
import UserSessionService from '#services/user_session_service'
import AuditLogService from '#services/audit_log_service'

const PLATFORM_SESSION_KEY = 'platform_session_token'

export default class AuthController {
  /**
   * Show the login form (guest only).
   * When AUTH_METHOD=oidc, redirect straight to the social auth flow.
   */
  async showLogin({ view, response }: HttpContext) {
    if (env.get('AUTH_METHOD') === 'oidc') {
      return response.redirect().toRoute('auth.social.redirect')
    }
    return view.render('auth/login')
  }

  /**
   * Handle login form submission
   */
  async login({ request, response, auth, session }: HttpContext) {
    const { email, password } = await request.validateUsing(loginValidator)

    const userModule = await import('#models/user')
    const User = userModule.default

    try {
      const user = await User.verifyCredentials(email, password)

      if (!user.isActive) {
        session.flash(
          'errors.login',
          'Your account is inactive. Please contact your administrator.'
        )
        return response.redirect().toRoute('auth.login')
      }

      await auth.use('web').login(user)

      // Create platform session record
      const platformToken = await new UserSessionService().create(user.id, 'database')
      session.put(PLATFORM_SESSION_KEY, platformToken)

      // Update last login timestamp
      user.lastLoginAt = DateTime.now()
      await user.save()

      // Audit log
      await new AuditLogService().record({
        actorUserId: user.id,
        actorEmail: user.email,
        action: 'login',
        ipAddress: request.ip(),
      })

      return response.redirect('/dashboard')
    } catch {
      // Audit failed login attempt (email may or may not belong to a user)
      await new AuditLogService().record({
        actorUserId: null,
        actorEmail: email,
        action: 'login.failed',
        ipAddress: request.ip(),
      })

      session.flash('errors.login', 'Invalid email or password')
      session.flash('email', email)
      return response.redirect().toRoute('auth.login')
    }
  }

  /**
   * Handle logout
   */
  async logout({ auth, response, session }: HttpContext) {
    const user = auth.user

    // Revoke platform session — by token if available, otherwise by user ID
    const platformToken = session.get(PLATFORM_SESSION_KEY) as string | undefined
    if (platformToken) {
      await new UserSessionService().revokeByToken(platformToken)
      session.forget(PLATFORM_SESSION_KEY)
    } else if (user) {
      await new UserSessionService().revokeAllForUser(user.id)
    }

    if (user) {
      await new AuditLogService().record({
        actorUserId: user.id,
        actorEmail: user.email,
        action: 'logout',
      })
    }

    await auth.use('web').logout()
    return response.redirect().toRoute('auth.login')
  }
}
