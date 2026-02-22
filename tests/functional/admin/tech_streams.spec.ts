import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import User from '#models/user'
import UserRole from '#models/user_role'
import TechStream from '#models/tech_stream'

async function createAdminUser() {
  const user = await User.create({
    fullName: 'Admin User',
    email: 'admin-ts@example.com',
    password: 'password123',
    isActive: true,
  })
  await UserRole.create({
    userId: user.id,
    role: 'platform_admin',
    grantedAt: DateTime.now(),
  })
  return user
}

test.group('Admin | Tech Streams | new fields — create', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('saves custom ticket regex on create', async ({ client, assert }) => {
    const admin = await createAdminUser()

    const response = await client
      .post('/admin/streams/tech')
      .loginAs(admin)
      .withCsrfToken()
      .fields({
        name: 'custom-ts',
        displayName: 'Custom TS',
        githubOrg: 'acme-custom',
        githubInstallId: '77777',
        ticketRegex: '(CUST-\\d+)',
      })
      .redirects(0)

    response.assertStatus(302)

    const stream = await TechStream.findByOrFail('name', 'custom-ts')
    assert.equal(stream.ticketRegex, '(CUST-\\d+)')
  })

  test('saves custom min_contributors on create', async ({ client, assert }) => {
    const admin = await createAdminUser()

    const response = await client
      .post('/admin/streams/tech')
      .loginAs(admin)
      .withCsrfToken()
      .fields({
        name: 'minc-ts',
        displayName: 'MinC TS',
        githubOrg: 'acme-minc',
        githubInstallId: '88888',
        minContributors: '10',
      })
      .redirects(0)

    response.assertStatus(302)

    const stream = await TechStream.findByOrFail('name', 'minc-ts')
    assert.equal(stream.minContributors, 10)
  })

  test('rejects invalid regex pattern', async ({ client }) => {
    const admin = await createAdminUser()

    const response = await client
      .post('/admin/streams/tech')
      .loginAs(admin)
      .withCsrfToken()
      .fields({
        name: 'badregex-ts',
        displayName: 'Bad Regex TS',
        githubOrg: 'acme-bad',
        githubInstallId: '99999',
        ticketRegex: '([unclosed',
      })
      .redirects(0)

    response.assertStatus(302)
    response.assertHeader('location', '/admin/streams/tech/create')
  })
})
