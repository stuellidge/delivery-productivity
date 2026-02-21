import type { HttpContext } from '@adonisjs/core/http'
import type { Oauth2AccessToken, ApiRequestContract } from '@poppinss/oauth-client/types'
import type { AllyUserContract } from '@adonisjs/ally/types'
import { Oauth2Driver } from '@adonisjs/ally'

export interface MicrosoftDriverConfig {
  clientId: string
  clientSecret: string
  callbackUrl: string
  tenantId: string
  scopes?: string[]
}

type MicrosoftScopes =
  | 'openid'
  | 'email'
  | 'profile'
  | 'offline_access'
  | 'User.Read'
  | 'GroupMember.Read.All'

/**
 * Custom OAuth2 driver for Microsoft Entra ID (Azure AD).
 */
export class MicrosoftDriver extends Oauth2Driver<Oauth2AccessToken, MicrosoftScopes> {
  protected codeParamName = 'code'
  protected errorParamName = 'error'
  protected stateCookieName = 'microsoft_oauth_state'
  protected stateParamName = 'state'
  protected scopeParamName = 'scope'
  protected scopesSeparator = ' '

  // These will be set in constructor once tenantId is known
  protected authorizeUrl = ''
  protected accessTokenUrl = ''

  private readonly microsoftConfig: MicrosoftDriverConfig

  constructor(ctx: HttpContext, config: MicrosoftDriverConfig) {
    super(ctx, {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      callbackUrl: config.callbackUrl,
    })
    this.microsoftConfig = config
    const tenant = config.tenantId || 'common'
    this.authorizeUrl = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`
    this.accessTokenUrl = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`
    this.loadState()
  }

  protected configureRedirectRequest(request: any) {
    request.scopes(this.microsoftConfig.scopes || ['openid', 'email', 'profile', 'User.Read'])
    request.param('response_type', 'code')
    request.param('response_mode', 'query')
  }

  protected getAuthenticatedRequest(url: string, token: string) {
    const request = this.httpClient(url)
    request.header('Authorization', `Bearer ${token}`)
    request.header('Accept', 'application/json')
    return request
  }

  private async fetchUserInfo(
    token: string,
    callback?: (request: ApiRequestContract) => void
  ) {
    const request = this.getAuthenticatedRequest('https://graph.microsoft.com/v1.0/me', token)
    if (typeof callback === 'function') callback(request)

    const body = await request.get()

    return {
      id: String(body.id ?? ''),
      nickName: String(body.displayName ?? body.userPrincipalName ?? ''),
      name: String(body.displayName ?? body.userPrincipalName ?? ''),
      email: (body.mail ?? body.userPrincipalName ?? null) as string | null,
      avatarUrl: null as null,
      emailVerificationState: 'verified' as const,
      original: body,
    }
  }

  accessDenied(): boolean {
    return this.getError() === 'access_denied'
  }

  async user(
    callback?: (request: ApiRequestContract) => void
  ): Promise<AllyUserContract<Oauth2AccessToken>> {
    const token = await this.accessToken()
    const info = await this.fetchUserInfo(token.token, callback)
    return { token, ...info }
  }

  async userFromToken(
    token: string,
    callback?: (request: ApiRequestContract) => void
  ): Promise<AllyUserContract<{ token: string; type: 'bearer' }>> {
    const info = await this.fetchUserInfo(token, callback)
    return { token: { token, type: 'bearer' }, ...info }
  }
}
