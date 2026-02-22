import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import User from '#models/user'
import UserRole from '#models/user_role'
import PlatformSetting from '#models/platform_setting'

async function createAdminUser() {
  const user = await User.create({
    fullName: 'Admin PS User',
    email: 'admin-ps@example.com',
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
    fullName: 'Viewer PS User',
    email: 'viewer-ps@example.com',
    password: 'password123',
    isActive: true,
  })
}

test.group('Admin | Platform Settings | index', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('redirects unauthenticated to login', async ({ client }) => {
    const response = await client.get('/admin/platform-settings').redirects(0)
    response.assertStatus(302)
    response.assertHeader('location', '/login')
  })

  test('redirects non-admin to dashboard', async ({ client }) => {
    const viewer = await createViewerUser()
    const response = await client.get('/admin/platform-settings').loginAs(viewer).redirects(0)
    response.assertStatus(302)
    response.assertHeader('location', '/dashboard')
  })

  test('admin can view platform settings list', async ({ client }) => {
    const admin = await createAdminUser()
    const response = await client.get('/admin/platform-settings').loginAs(admin)
    response.assertStatus(200)
    response.assertTextIncludes('Platform Settings')
  })
})

test.group('Admin | Platform Settings | update', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('admin can update a setting with valid JSON', async ({ client, assert }) => {
    const admin = await createAdminUser()

    // Create a test setting
    await PlatformSetting.create({
      key: 'test_setting_update',
      value: { foo: 'bar' },
      description: 'Test setting',
    })

    const newValue = JSON.stringify({ foo: 'updated' })
    const response = await client
      .put('/admin/platform-settings/test_setting_update')
      .loginAs(admin)
      .withCsrfToken()
      .fields({ value: newValue })
      .redirects(0)

    response.assertStatus(302)

    const setting = await PlatformSetting.findByOrFail('key', 'test_setting_update')
    assert.deepEqual(setting.value, { foo: 'updated' })
  })

  test('rejects invalid JSON on update', async ({ client }) => {
    const admin = await createAdminUser()

    await PlatformSetting.create({
      key: 'test_setting_bad_json',
      value: { foo: 'bar' },
      description: 'Test setting',
    })

    const response = await client
      .put('/admin/platform-settings/test_setting_bad_json')
      .loginAs(admin)
      .withCsrfToken()
      .fields({ value: 'this is not json {{{' })
      .redirects(0)

    response.assertStatus(302)
    response.assertHeader('location', '/admin/platform-settings/test_setting_bad_json/edit')
  })

  test('rejects malformed threshold array structure', async ({ client }) => {
    const admin = await createAdminUser()
    // The seeded thresholds row exists from migration
    const malformed = JSON.stringify([{ notTheRight: 'fields' }])

    const response = await client
      .put('/admin/platform-settings/cross_stream_severity_thresholds')
      .loginAs(admin)
      .withCsrfToken()
      .fields({ value: malformed })
      .redirects(0)

    response.assertStatus(302)
    response.assertHeader(
      'location',
      '/admin/platform-settings/cross_stream_severity_thresholds/edit'
    )
  })
})
