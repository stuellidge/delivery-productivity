import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import User from '#models/user'
import UserRole from '#models/user_role'
import ApiKey from '#models/api_key'
import { DateTime } from 'luxon'

async function createAdminUser() {
  const user = await User.create({
    fullName: 'Admin User',
    email: 'admin@example.com',
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

async function createViewerUser() {
  return User.create({
    fullName: 'Viewer User',
    email: 'viewer@example.com',
    password: 'password123',
    isActive: true,
  })
}

test.group('Admin | API Keys | index', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('redirects unauthenticated users to login', async ({ client }) => {
    const response = await client.get('/admin/api-keys').redirects(0)
    response.assertStatus(302)
    response.assertHeader('location', '/login')
  })

  test('returns 302 for non-admin users redirecting to dashboard', async ({ client }) => {
    const viewer = await createViewerUser()
    const response = await client.get('/admin/api-keys').loginAs(viewer).redirects(0)
    response.assertStatus(302)
    response.assertHeader('location', '/dashboard')
  })

  test('lists API keys for admins', async ({ client }) => {
    const admin = await createAdminUser()
    await ApiKey.create({
      keyHash: 'abc123hash',
      displayName: 'CI Pipeline Key',
      permissions: [],
      isActive: true,
      createdBy: admin.id,
    })

    const response = await client.get('/admin/api-keys').loginAs(admin)
    response.assertStatus(200)
    response.assertTextIncludes('CI Pipeline Key')
  })

  test('never exposes the key_hash in the response', async ({ client }) => {
    const admin = await createAdminUser()
    await ApiKey.create({
      keyHash: 'super-secret-hash',
      displayName: 'Secret Key',
      permissions: [],
      isActive: true,
      createdBy: admin.id,
    })

    const response = await client.get('/admin/api-keys').loginAs(admin)
    response.assertStatus(200)
    const text = response.text()
    assert_not_includes(text, 'super-secret-hash')
  })
})

function assert_not_includes(text: string, substring: string) {
  if (text.includes(substring)) {
    throw new Error(`Expected text NOT to include "${substring}"`)
  }
}

test.group('Admin | API Keys | create', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('shows create form for admins', async ({ client }) => {
    const admin = await createAdminUser()
    const response = await client.get('/admin/api-keys/create').loginAs(admin)
    response.assertStatus(200)
    response.assertTextIncludes('New API Key')
  })
})

test.group('Admin | API Keys | store', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('creates an API key with valid data', async ({ client, assert }) => {
    const admin = await createAdminUser()

    const response = await client
      .post('/admin/api-keys')
      .loginAs(admin)
      .withCsrfToken()
      .fields({ displayName: 'Deployment Pipeline' })
      .redirects(0)

    response.assertStatus(302)
    response.assertHeader('location', '/admin/api-keys')

    const key = await ApiKey.findByOrFail('display_name', 'Deployment Pipeline')
    assert.isTrue(key.isActive)
    assert.isNotNull(key.keyHash)
    assert.equal(key.createdBy, admin.id)
  })

  test('rejects missing display name', async ({ client }) => {
    const admin = await createAdminUser()

    const response = await client
      .post('/admin/api-keys')
      .loginAs(admin)
      .withCsrfToken()
      .fields({})
      .redirects(0)

    response.assertStatus(302)
    response.assertHeader('location', '/admin/api-keys/create')
  })

  test('redirects non-admin store attempts', async ({ client }) => {
    const viewer = await createViewerUser()

    const response = await client
      .post('/admin/api-keys')
      .loginAs(viewer)
      .withCsrfToken()
      .fields({ displayName: 'Test Key' })
      .redirects(0)

    response.assertStatus(302)
    response.assertHeader('location', '/dashboard')
  })
})

test.group('Admin | API Keys | revoke', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('revokes an active API key', async ({ client, assert }) => {
    const admin = await createAdminUser()
    const key = await ApiKey.create({
      keyHash: 'somehashvalue',
      displayName: 'Key To Revoke',
      permissions: [],
      isActive: true,
      createdBy: admin.id,
    })

    const response = await client
      .post(`/admin/api-keys/${key.id}/revoke`)
      .loginAs(admin)
      .withCsrfToken()
      .redirects(0)

    response.assertStatus(302)
    response.assertHeader('location', '/admin/api-keys')

    await key.refresh()
    assert.isFalse(key.isActive)
  })

  test('returns 404 for non-existent key', async ({ client }) => {
    const admin = await createAdminUser()

    const response = await client
      .post('/admin/api-keys/99999/revoke')
      .loginAs(admin)
      .withCsrfToken()

    response.assertStatus(404)
  })
})
