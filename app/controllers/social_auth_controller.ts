import type { HttpContext } from '@adonisjs/core/http'
import env from '#start/env'
import OidcGroupMappingService from '#services/oidc_group_mapping_service'
import type { MicrosoftDriver } from '#services/microsoft_driver'

type AnyAlly = { use(provider: string): MicrosoftDriver }

export default class SocialAuthController {
  private readonly provider = 'microsoft'

  /**
   * Redirect user to the OAuth provider's authorization page.
   */
  async redirect({ ally }: HttpContext) {
    return (ally as unknown as AnyAlly).use(this.provider).redirect()
  }

  /**
   * Handle the OAuth callback from the provider.
   * 1. Check for errors / access denied
   * 2. Get user from provider
   * 3. Decode JWT to extract groups claim
   * 4. Find or create User record
   * 5. Apply OIDC group → role mappings
   * 6. Login and redirect to dashboard
   */
  async callback({ ally, auth, session, response }: HttpContext) {
    const social = (ally as unknown as AnyAlly).use(this.provider)

    if (social.hasError()) {
      session.flash('errors.login', social.getError() ?? 'OAuth error')
      return response.redirect().toRoute('auth.login')
    }

    if (!social.hasCode()) {
      session.flash('errors.login', 'No authorization code received')
      return response.redirect().toRoute('auth.login')
    }

    try {
      const socialUser = await social.user()

      // Extract groups from the raw ID token JWT payload (base64-decoded)
      const groups = this.extractGroupsFromToken(socialUser.token.token)

      const service = new OidcGroupMappingService()
      const user = await service.findOrCreateUser(
        socialUser.email ?? socialUser.nickName,
        socialUser.name ?? socialUser.nickName
      )

      await service.applyMappings(user.id, groups, this.provider)

      await auth.use('web').login(user)

      return response.redirect('/dashboard')
    } catch (err) {
      session.flash('errors.login', 'Authentication failed. Please try again.')
      return response.redirect().toRoute('auth.login')
    }
  }

  /**
   * Decode a JWT and extract the groups claim from the payload.
   * Does not verify the signature — that was already done by Microsoft.
   */
  private extractGroupsFromToken(token: string): string[] {
    try {
      const parts = token.split('.')
      if (parts.length < 2) return []
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
      const claimName = env.get('OIDC_GROUP_CLAIM') ?? 'groups'
      const groups = payload[claimName]
      return Array.isArray(groups) ? groups : []
    } catch {
      return []
    }
  }
}
