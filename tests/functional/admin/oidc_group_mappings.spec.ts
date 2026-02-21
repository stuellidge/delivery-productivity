import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import User from '#models/user'
import UserRole from '#models/user_role'
import OidcGroupMapping from '#models/oidc_group_mapping'

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

test.group('Admin | OIDC Group Mappings | index', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('unauthenticated user is redirected to login', async ({ client }) => {
    const response = await client.get('/admin/oidc-group-mappings').redirects(0)
    response.assertStatus(302)
    response.assertHeader('location', '/login')
  })

  test('non-admin user is redirected to dashboard', async ({ client }) => {
    const viewer = await createViewerUser()
    const response = await client.get('/admin/oidc-group-mappings').loginAs(viewer).redirects(0)
    response.assertStatus(302)
    response.assertHeader('location', '/dashboard')
  })

  test('admin can list group mappings', async ({ client }) => {
    const admin = await createAdminUser()
    await OidcGroupMapping.create({
      provider: 'microsoft',
      groupPattern: 'sg-platform-admin',
      isRegex: false,
      role: 'platform_admin',
      deliveryStreamId: null,
      techStreamId: null,
      createdBy: admin.id,
    })
    const response = await client.get('/admin/oidc-group-mappings').loginAs(admin)
    response.assertStatus(200)
    response.assertTextIncludes('sg-platform-admin')
  })
})

test.group('Admin | OIDC Group Mappings | create form', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('admin can view create form', async ({ client }) => {
    const admin = await createAdminUser()
    const response = await client.get('/admin/oidc-group-mappings/create').loginAs(admin)
    response.assertStatus(200)
  })
})

test.group('Admin | OIDC Group Mappings | store', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('admin can create a mapping', async ({ client, assert }) => {
    const admin = await createAdminUser()
    const response = await client
      .post('/admin/oidc-group-mappings')
      .loginAs(admin)
      .withCsrfToken()
      .fields({
        provider: 'microsoft',
        group_pattern: 'sg-new-admins',
        is_regex: '0',
        role: 'platform_admin',
      })
      .redirects(0)
    response.assertStatus(302)
    response.assertHeader('location', '/admin/oidc-group-mappings')
    const mapping = await OidcGroupMapping.findByOrFail('group_pattern', 'sg-new-admins')
    assert.equal(mapping.role, 'platform_admin')
    assert.equal(mapping.createdBy, admin.id)
  })

  test('rejects invalid role', async ({ client }) => {
    const admin = await createAdminUser()
    const response = await client
      .post('/admin/oidc-group-mappings')
      .loginAs(admin)
      .withCsrfToken()
      .fields({
        provider: 'microsoft',
        group_pattern: 'sg-bad',
        is_regex: '0',
        role: 'super_admin',
      })
      .redirects(0)
    response.assertStatus(302)
    response.assertHeader('location', '/admin/oidc-group-mappings/create')
  })

  test('non-admin cannot create a mapping', async ({ client }) => {
    const viewer = await createViewerUser()
    const response = await client
      .post('/admin/oidc-group-mappings')
      .loginAs(viewer)
      .withCsrfToken()
      .fields({
        provider: 'microsoft',
        group_pattern: 'sg-blocked',
        is_regex: '0',
        role: 'platform_admin',
      })
      .redirects(0)
    response.assertStatus(302)
    response.assertHeader('location', '/dashboard')
  })
})

test.group('Admin | OIDC Group Mappings | destroy', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('admin can delete a mapping', async ({ client, assert }) => {
    const admin = await createAdminUser()
    const mapping = await OidcGroupMapping.create({
      provider: 'microsoft',
      groupPattern: 'sg-to-delete',
      isRegex: false,
      role: 'viewer',
      deliveryStreamId: null,
      techStreamId: null,
      createdBy: admin.id,
    })
    const response = await client
      .delete(`/admin/oidc-group-mappings/${mapping.id}`)
      .loginAs(admin)
      .withCsrfToken()
      .redirects(0)
    response.assertStatus(302)
    response.assertHeader('location', '/admin/oidc-group-mappings')
    const deleted = await OidcGroupMapping.find(mapping.id)
    assert.isNull(deleted)
  })
})
