import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import User from '#models/user'
import UserRole from '#models/user_role'

async function createAdminUser(email = 'admin@example.com') {
  const user = await User.create({
    fullName: 'Admin User',
    email,
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

async function createRegularUser(email = 'viewer@example.com') {
  return User.create({
    fullName: 'Viewer User',
    email,
    password: 'password123',
    isActive: true,
  })
}

test.group('Admin | Users | index', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('redirects unauthenticated users to login', async ({ client }) => {
    const response = await client.get('/admin/users').redirects(0)
    response.assertStatus(302)
    response.assertHeader('location', '/login')
  })

  test('redirects non-admin to dashboard', async ({ client }) => {
    const viewer = await createRegularUser()
    const response = await client.get('/admin/users').loginAs(viewer).redirects(0)
    response.assertStatus(302)
    response.assertHeader('location', '/dashboard')
  })

  test('admin can list all users', async ({ client }) => {
    const admin = await createAdminUser()
    await createRegularUser('other@example.com')

    const response = await client.get('/admin/users').loginAs(admin)
    response.assertStatus(200)
    response.assertTextIncludes('Admin User')
    response.assertTextIncludes('other@example.com')
  })
})

test.group('Admin | Users | show', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('admin can view user detail with roles', async ({ client }) => {
    const admin = await createAdminUser()
    const viewer = await createRegularUser()
    await UserRole.create({
      userId: viewer.id,
      role: 'viewer',
      grantedAt: DateTime.now(),
      grantedBy: admin.id,
    })

    const response = await client.get(`/admin/users/${viewer.id}`).loginAs(admin)
    response.assertStatus(200)
    response.assertTextIncludes('Viewer User')
    response.assertTextIncludes('viewer')
  })

  test('returns 404 for non-existent user', async ({ client }) => {
    const admin = await createAdminUser()
    const response = await client.get('/admin/users/99999').loginAs(admin)
    response.assertStatus(404)
  })
})

test.group('Admin | Users | activate/deactivate', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('admin can deactivate a user', async ({ client, assert }) => {
    const admin = await createAdminUser()
    const user = await createRegularUser()
    assert.isTrue(user.isActive)

    const response = await client
      .post(`/admin/users/${user.id}/deactivate`)
      .loginAs(admin)
      .withCsrfToken()
      .redirects(0)

    response.assertStatus(302)
    await user.refresh()
    assert.isFalse(user.isActive)
  })

  test('admin can reactivate a deactivated user', async ({ client, assert }) => {
    const admin = await createAdminUser()
    const user = await createRegularUser()
    user.isActive = false
    await user.save()

    const response = await client
      .post(`/admin/users/${user.id}/activate`)
      .loginAs(admin)
      .withCsrfToken()
      .redirects(0)

    response.assertStatus(302)
    await user.refresh()
    assert.isTrue(user.isActive)
  })
})

test.group('Admin | Users | roles', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('admin can add a manually-granted role', async ({ client, assert }) => {
    const admin = await createAdminUser()
    const user = await createRegularUser()

    const response = await client
      .post(`/admin/users/${user.id}/roles`)
      .loginAs(admin)
      .withCsrfToken()
      .fields({ role: 'viewer' })
      .redirects(0)

    response.assertStatus(302)

    const role = await UserRole.query().where('user_id', user.id).where('role', 'viewer').first()

    assert.isNotNull(role)
    assert.equal(role!.grantedBy, admin.id)
  })

  test('admin can remove a manually-granted role', async ({ client, assert }) => {
    const admin = await createAdminUser()
    const user = await createRegularUser()

    const role = await UserRole.create({
      userId: user.id,
      role: 'viewer',
      grantedAt: DateTime.now(),
      grantedBy: admin.id,
    })

    const response = await client
      .post(`/admin/users/${user.id}/roles/${role.id}?_method=DELETE`)
      .loginAs(admin)
      .withCsrfToken()
      .redirects(0)

    response.assertStatus(302)

    const deleted = await UserRole.find(role.id)
    assert.isNull(deleted)
  })

  test('cannot remove an OIDC-granted role (grantedBy null)', async ({ client, assert }) => {
    const admin = await createAdminUser()
    const user = await createRegularUser()

    // Role granted via OIDC (grantedBy is null)
    const role = await UserRole.create({
      userId: user.id,
      role: 'viewer',
      grantedAt: DateTime.now(),
      grantedBy: null,
    })

    const response = await client
      .post(`/admin/users/${user.id}/roles/${role.id}?_method=DELETE`)
      .loginAs(admin)
      .withCsrfToken()
      .redirects(0)

    response.assertStatus(302)

    // Role should still exist
    const existing = await UserRole.find(role.id)
    assert.isNotNull(existing)
  })
})
