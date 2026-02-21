import env from '#start/env'
import type { HttpContext } from '@adonisjs/core/http'
import { defineConfig } from '@adonisjs/ally'
import { MicrosoftDriver } from '#services/microsoft_driver'

const allyConfig = defineConfig({
  microsoft: (ctx: HttpContext) =>
    new MicrosoftDriver(ctx, {
      clientId: env.get('OIDC_CLIENT_ID', 'placeholder'),
      clientSecret: env.get('OIDC_CLIENT_SECRET', 'placeholder'),
      callbackUrl: env.get('OIDC_REDIRECT_URI', 'http://localhost:3333/auth/social/callback'),
      tenantId: env.get('OIDC_TENANT_ID', 'common'),
      scopes: ['openid', 'email', 'profile', 'User.Read'],
    }),
})

export default allyConfig

// Register Microsoft as a known social provider in the AllyManager type system
declare module '@adonisjs/ally/types' {
  interface SocialProviders {
    microsoft: (ctx: HttpContext) => MicrosoftDriver
  }
}
