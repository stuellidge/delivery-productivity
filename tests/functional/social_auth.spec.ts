import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import User from '#models/user'
import OidcGroupMapping from '#models/oidc_group_mapping'
import UserRole from '#models/user_role'

/**
 * Social auth functional tests.
 *
 * These tests verify the route/controller plumbing. Full OAuth flow
 * (token exchange with Microsoft) is not tested here — unit tests for
 * OidcGroupMappingService cover the business logic.
 */

test.group('Social Auth | redirect', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('GET /auth/social/redirect returns 302 to Microsoft OAuth URL', async ({ client }) => {
    const response = await client.get('/auth/social/redirect').redirects(0)
    response.assertStatus(302)
    const location = response.header('location') as string
    assert_includes(location, 'login.microsoftonline.com')
  })
})

test.group('Social Auth | callback | error state', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('redirects to login with error flash when error param present', async ({ client }) => {
    const response = await client
      .get('/auth/social/callback?error=access_denied&error_description=User+denied+access')
      .redirects(0)
    response.assertStatus(302)
    response.assertHeader('location', '/login')
  })
})

test.group('Social Auth | callback | success (stubbed)', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  /**
   * The success callback requires exchanging an auth code with Microsoft.
   * We test the business logic path indirectly by verifying:
   * 1. The route is registered and reachable
   * 2. Without a valid code, ally redirects to login (hasError = true)
   */
  test('GET /auth/social/callback without code redirects to login', async ({ client }) => {
    const response = await client.get('/auth/social/callback').redirects(0)
    response.assertStatus(302)
    response.assertHeader('location', '/login')
  })
})

test.group('Social Auth | findOrCreateUser integration', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('OidcGroupMapping drives role assignment on login', async ({ assert }) => {
    // Create a mapping and verify it will be applied when a user logs in
    await OidcGroupMapping.create({
      provider: 'microsoft',
      groupPattern: 'sg-admin',
      isRegex: false,
      role: 'platform_admin',
      deliveryStreamId: null,
      techStreamId: null,
      createdBy: null,
    })
    // Seed a user as if they just completed OIDC login
    const user = await User.create({
      fullName: 'OIDC User',
      email: 'oidc@example.com',
      password: 'generated-oidc-no-password',
      isActive: true,
    })
    const { default: OidcGroupMappingService } =
      await import('#services/oidc_group_mapping_service')
    const service = new OidcGroupMappingService()
    await service.applyMappings(user.id, ['sg-admin'], 'microsoft')
    const roles = await UserRole.query().where('user_id', user.id)
    assert.equal(roles.length, 1)
    assert.equal(roles[0].role, 'platform_admin')
  })
})

function assert_includes(haystack: string, needle: string) {
  if (!haystack.includes(needle)) {
    throw new Error(`Expected "${haystack}" to include "${needle}"`)
  }
}
