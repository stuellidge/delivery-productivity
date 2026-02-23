import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import User from '#models/user'
import UserRole from '#models/user_role'
import PublicHoliday from '#models/public_holiday'

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
    fullName: 'Viewer',
    email: 'viewer@example.com',
    password: 'password123',
    isActive: true,
  })
}

test.group('Admin | Public Holidays | index', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('redirects unauthenticated users to login', async ({ client }) => {
    const response = await client.get('/admin/public-holidays').redirects(0)
    response.assertStatus(302)
    response.assertHeader('location', '/login')
  })

  test('returns 302 for non-admin users', async ({ client }) => {
    const viewer = await createViewerUser()
    const response = await client.get('/admin/public-holidays').loginAs(viewer).redirects(0)
    response.assertStatus(302)
    response.assertHeader('location', '/dashboard')
  })

  test('lists public holidays for admins', async ({ client }) => {
    const admin = await createAdminUser()
    await PublicHoliday.create({ date: '2026-12-25', name: 'Christmas Day' })

    const response = await client.get('/admin/public-holidays').loginAs(admin)
    response.assertStatus(200)
    response.assertTextIncludes('Christmas Day')
    response.assertTextIncludes('2026-12-25')
  })
})

test.group('Admin | Public Holidays | create', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('shows the create form', async ({ client }) => {
    const admin = await createAdminUser()
    const response = await client.get('/admin/public-holidays/create').loginAs(admin)
    response.assertStatus(200)
    response.assertTextIncludes('Add Holiday')
  })
})

test.group('Admin | Public Holidays | store', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('creates a public holiday with valid data', async ({ client, assert }) => {
    const admin = await createAdminUser()

    const response = await client
      .post('/admin/public-holidays')
      .loginAs(admin)
      .withCsrfToken()
      .fields({ date: '2026-12-25', name: 'Christmas Day' })
      .redirects(0)

    response.assertStatus(302)
    response.assertHeader('location', '/admin/public-holidays')

    const holiday = await PublicHoliday.findByOrFail('date', '2026-12-25')
    assert.equal(holiday.name, 'Christmas Day')
  })

  test('rejects missing date', async ({ client }) => {
    const admin = await createAdminUser()

    const response = await client
      .post('/admin/public-holidays')
      .loginAs(admin)
      .withCsrfToken()
      .fields({ name: 'Mystery Holiday' })
      .redirects(0)

    response.assertStatus(302)
    response.assertHeader('location', '/admin/public-holidays/create')
  })

  test('rejects duplicate date', async ({ client }) => {
    const admin = await createAdminUser()
    await PublicHoliday.create({ date: '2026-12-25', name: 'Christmas Day' })

    const response = await client
      .post('/admin/public-holidays')
      .loginAs(admin)
      .withCsrfToken()
      .fields({ date: '2026-12-25', name: 'Duplicate' })
      .redirects(0)

    response.assertStatus(302)
    response.assertHeader('location', '/admin/public-holidays/create')
  })
})

test.group('Admin | Public Holidays | destroy', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('deletes a public holiday', async ({ client, assert }) => {
    const admin = await createAdminUser()
    const holiday = await PublicHoliday.create({ date: '2026-12-25', name: 'Christmas Day' })

    const response = await client
      .delete(`/admin/public-holidays/${holiday.id}`)
      .loginAs(admin)
      .withCsrfToken()
      .redirects(0)

    response.assertStatus(302)
    response.assertHeader('location', '/admin/public-holidays')

    const gone = await PublicHoliday.find(holiday.id)
    assert.isNull(gone)
  })
})
