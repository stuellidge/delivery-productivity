import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import User from '#models/user'

test.group('Security headers | CSP', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('dashboard returns a Content-Security-Policy header', async ({ client, assert }) => {
    const user = await User.create({
      fullName: 'Test User',
      email: 'csp-test@example.com',
      password: 'password123',
      isActive: true,
    })

    const response = await client.get('/dashboard').loginAs(user)

    response.assertStatus(200)
    assert.isTrue(
      response.headers()['content-security-policy'] !== undefined,
      'Expected Content-Security-Policy header to be present'
    )
  })
})
