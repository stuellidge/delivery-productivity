import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import User from '#models/user'
import UserRole from '#models/user_role'
import DeliveryStream from '#models/delivery_stream'
import TechStream from '#models/tech_stream'

async function createUser() {
  return User.create({
    fullName: 'Test User',
    email: 'test@example.com',
    password: 'password123',
    isActive: true,
  })
}

test.group('User | hasRole()', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns true when user has the specified global role', async ({ assert }) => {
    const user = await createUser()
    await UserRole.create({ userId: user.id, role: 'platform_admin', grantedAt: DateTime.now() })

    assert.isTrue(await user.hasRole('platform_admin'))
  })

  test('returns false when user does not have the role', async ({ assert }) => {
    const user = await createUser()
    assert.isFalse(await user.hasRole('platform_admin'))
  })

  test('returns false when user has a different role (exercises role !== roleName branch)', async ({
    assert,
  }) => {
    const user = await createUser()
    // User has 'viewer' but we check for 'platform_admin' — callback runs, returns false
    await UserRole.create({ userId: user.id, role: 'viewer', grantedAt: DateTime.now() })

    assert.isFalse(await user.hasRole('platform_admin'))
  })

  test('returns true for scoped role when deliveryStreamId matches', async ({ assert }) => {
    const user = await createUser()
    const stream = await DeliveryStream.create({
      name: 'payments',
      displayName: 'Payments',
      isActive: true,
    })

    await UserRole.create({
      userId: user.id,
      role: 'stream_lead',
      deliveryStreamId: stream.id,
      grantedAt: DateTime.now(),
    })

    assert.isTrue(await user.hasRole('stream_lead', { deliveryStreamId: stream.id }))
  })

  test('returns false for scoped role when deliveryStreamId does not match', async ({ assert }) => {
    const user = await createUser()
    const stream1 = await DeliveryStream.create({
      name: 'payments',
      displayName: 'Payments',
      isActive: true,
    })
    const stream2 = await DeliveryStream.create({
      name: 'onboarding',
      displayName: 'Onboarding',
      isActive: true,
    })

    await UserRole.create({
      userId: user.id,
      role: 'stream_lead',
      deliveryStreamId: stream1.id,
      grantedAt: DateTime.now(),
    })

    assert.isFalse(await user.hasRole('stream_lead', { deliveryStreamId: stream2.id }))
  })

  test('returns true for scoped role when techStreamId matches', async ({ assert }) => {
    const user = await createUser()
    const techStream = await TechStream.create({
      name: 'core-api',
      displayName: 'Core API',
      githubOrg: 'acme-core-api',
      githubInstallId: 'install-1',
      isActive: true,
    })

    await UserRole.create({
      userId: user.id,
      role: 'team_member',
      techStreamId: techStream.id,
      grantedAt: DateTime.now(),
    })

    assert.isTrue(await user.hasRole('team_member', { techStreamId: techStream.id }))
  })

  test('returns false for scoped role when techStreamId does not match', async ({ assert }) => {
    const user = await createUser()
    const tech1 = await TechStream.create({
      name: 'core-api',
      displayName: 'Core API',
      githubOrg: 'acme-core-api',
      githubInstallId: 'install-1',
      isActive: true,
    })
    const tech2 = await TechStream.create({
      name: 'auth',
      displayName: 'Auth',
      githubOrg: 'acme-auth',
      githubInstallId: 'install-2',
      isActive: true,
    })

    await UserRole.create({
      userId: user.id,
      role: 'team_member',
      techStreamId: tech1.id,
      grantedAt: DateTime.now(),
    })

    assert.isFalse(await user.hasRole('team_member', { techStreamId: tech2.id }))
  })
})

test.group('User | isAdmin()', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns true for platform_admin users', async ({ assert }) => {
    const user = await createUser()
    await UserRole.create({ userId: user.id, role: 'platform_admin', grantedAt: DateTime.now() })

    assert.isTrue(await user.isAdmin())
  })

  test('returns false for non-admin users', async ({ assert }) => {
    const user = await createUser()
    assert.isFalse(await user.isAdmin())
  })
})
