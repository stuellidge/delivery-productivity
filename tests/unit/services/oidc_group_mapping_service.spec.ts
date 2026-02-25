import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import OidcGroupMapping from '#models/oidc_group_mapping'
import UserRole from '#models/user_role'
import User from '#models/user'
import OidcGroupMappingService from '#services/oidc_group_mapping_service'

async function createUser(email = 'test@example.com') {
  return User.create({ fullName: 'Test', email, password: 'pass', isActive: true })
}

async function createMapping(
  overrides: Partial<{
    provider: string
    groupPattern: string
    isRegex: boolean
    role: string
    deliveryStreamId: number | null
    techStreamId: number | null
  }> = {}
) {
  return OidcGroupMapping.create({
    provider: overrides.provider ?? 'microsoft',
    groupPattern: overrides.groupPattern ?? 'sg-platform-admin',
    isRegex: overrides.isRegex ?? false,
    role: (overrides.role ?? 'platform_admin') as any,
    deliveryStreamId: overrides.deliveryStreamId ?? null,
    techStreamId: overrides.techStreamId ?? null,
    createdBy: null,
  })
}

test.group('OidcGroupMappingService | matchGroups | exact match', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('maps exact group name to role', async ({ assert }) => {
    const mapping = await createMapping({
      groupPattern: 'sg-platform-admin',
      role: 'platform_admin',
    })
    const service = new OidcGroupMappingService()
    const result = service.matchGroups(['sg-platform-admin', 'sg-other'], [mapping])
    assert.lengthOf(result, 1)
    assert.equal(result[0].role, 'platform_admin')
  })

  test('returns empty array when no mappings match', async ({ assert }) => {
    const mapping = await createMapping({ groupPattern: 'sg-platform-admin' })
    const service = new OidcGroupMappingService()
    const result = service.matchGroups(['sg-unrelated'], [mapping])
    assert.lengthOf(result, 0)
  })
})

test.group('OidcGroupMappingService | matchGroups | regex match', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('maps regex group pattern to role', async ({ assert }) => {
    const mapping = await createMapping({
      groupPattern: '^sg-team-.*',
      isRegex: true,
      role: 'team_member',
    })
    const service = new OidcGroupMappingService()
    const result = service.matchGroups(['sg-team-alpha', 'sg-unrelated'], [mapping])
    assert.lengthOf(result, 1)
    assert.equal(result[0].role, 'team_member')
  })

  test('does not apply regex match when isRegex is false', async ({ assert }) => {
    const mapping = await createMapping({
      groupPattern: '^sg-team-.*',
      isRegex: false,
      role: 'team_member',
    })
    const service = new OidcGroupMappingService()
    const result = service.matchGroups(['sg-team-alpha'], [mapping])
    assert.lengthOf(result, 0)
  })
})

test.group('OidcGroupMappingService | matchGroups | stream scope', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('applies stream scope to role assignments', async ({ assert }) => {
    const mapping = await createMapping({
      groupPattern: 'sg-stream-lead',
      role: 'stream_lead',
      deliveryStreamId: null,
    })
    // Override the deliveryStreamId to a numeric value for scope testing
    mapping.deliveryStreamId = 99
    const service = new OidcGroupMappingService()
    const result = service.matchGroups(['sg-stream-lead'], [mapping])
    assert.lengthOf(result, 1)
    assert.equal(result[0].deliveryStreamId, 99)
  })
})

test.group('OidcGroupMappingService | getMappingsForProvider', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('provider filter: only returns mappings for the given provider', async ({ assert }) => {
    await createMapping({ provider: 'microsoft', groupPattern: 'group-a' })
    await createMapping({ provider: 'google', groupPattern: 'group-b' })
    const service = new OidcGroupMappingService()
    const result = await service.getMappingsForProvider('microsoft')
    assert.isTrue(result.every((m) => m.provider === 'microsoft'))
    assert.equal(result.length, 1)
    assert.equal(result[0].groupPattern, 'group-a')
  })
})

test.group('OidcGroupMappingService | applyMappings', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('inserts roles for matched groups', async ({ assert }) => {
    const user = await createUser()
    await createMapping({ provider: 'microsoft', groupPattern: 'sg-admin', role: 'platform_admin' })
    const service = new OidcGroupMappingService()
    await service.applyMappings(user.id, ['sg-admin'], 'microsoft')
    const roles = await UserRole.query().where('user_id', user.id)
    assert.equal(roles.length, 1)
    assert.equal(roles[0].role, 'platform_admin')
    assert.isNull(roles[0].grantedBy)
  })

  test('replaces existing OIDC-granted roles on re-login', async ({ assert }) => {
    const user = await createUser()
    // Pre-existing OIDC role (grantedBy = null)
    await UserRole.create({
      userId: user.id,
      role: 'viewer',
      grantedBy: null,
      grantedAt: DateTime.now(),
    })
    await createMapping({ provider: 'microsoft', groupPattern: 'sg-admin', role: 'platform_admin' })
    const service = new OidcGroupMappingService()
    await service.applyMappings(user.id, ['sg-admin'], 'microsoft')
    const roles = await UserRole.query().where('user_id', user.id)
    // Old viewer role removed, new platform_admin role added
    assert.equal(roles.length, 1)
    assert.equal(roles[0].role, 'platform_admin')
  })

  test('does not remove manually granted roles (grantedBy not null)', async ({ assert }) => {
    const admin = await createUser('admin@example.com')
    const user = await createUser()
    // Manually granted role
    await UserRole.create({
      userId: user.id,
      role: 'stream_lead',
      grantedBy: admin.id,
      grantedAt: DateTime.now(),
    })
    await createMapping({ provider: 'microsoft', groupPattern: 'sg-viewer', role: 'viewer' })
    const service = new OidcGroupMappingService()
    await service.applyMappings(user.id, ['sg-viewer'], 'microsoft')
    const roles = await UserRole.query().where('user_id', user.id)
    // Both roles: manually granted stream_lead + OIDC-granted viewer
    assert.equal(roles.length, 2)
    assert.isTrue(roles.some((r) => r.role === 'stream_lead'))
    assert.isTrue(roles.some((r) => r.role === 'viewer'))
  })
})

test.group('OidcGroupMappingService | findOrCreateUser', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('creates a new user when email does not exist', async ({ assert }) => {
    const service = new OidcGroupMappingService()
    const user = await service.findOrCreateUser('new@example.com', 'New User')
    assert.equal(user.email, 'new@example.com')
    assert.equal(user.fullName, 'New User')
    assert.isTrue(user.isActive)
  })

  test('each new user gets a unique placeholder password (randomness check)', async ({
    assert,
  }) => {
    const service = new OidcGroupMappingService()
    const user1 = await service.findOrCreateUser('crypto-a@example.com', 'User A')
    const user2 = await service.findOrCreateUser('crypto-b@example.com', 'User B')

    // Hashed passwords should differ because underlying random values differ
    assert.notEqual(user1.password, user2.password)
  })

  test('returns existing user when email exists', async ({ assert }) => {
    const existing = await createUser('existing@example.com')
    const service = new OidcGroupMappingService()
    const user = await service.findOrCreateUser('existing@example.com', 'Updated Name')
    assert.equal(user.id, existing.id)
  })
})
