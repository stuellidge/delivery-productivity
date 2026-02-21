import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import { loginValidator } from '#validators/auth_validator'
import env from '#start/env'

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

      // Update last login timestamp
      user.lastLoginAt = DateTime.now()
      await user.save()

      return response.redirect('/dashboard')
    } catch {
      session.flash('errors.login', 'Invalid email or password')
      session.flash('email', email)
      return response.redirect().toRoute('auth.login')
    }
  }

  /**
   * Handle logout
   */
  async logout({ auth, response }: HttpContext) {
    await auth.use('web').logout()
    return response.redirect().toRoute('auth.login')
  }
}
