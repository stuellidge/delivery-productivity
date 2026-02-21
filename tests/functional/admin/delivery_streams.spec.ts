import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import User from '#models/user'
import UserRole from '#models/user_role'
import DeliveryStream from '#models/delivery_stream'
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

test.group('Admin | Delivery Streams | index', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('redirects unauthenticated users to login', async ({ client }) => {
    const response = await client.get('/admin/streams/delivery').redirects(0)
    response.assertStatus(302)
    response.assertHeader('location', '/login')
  })

  test('returns 403 for non-admin users', async ({ client }) => {
    const viewer = await createViewerUser()
    const response = await client.get('/admin/streams/delivery').loginAs(viewer).redirects(0)
    response.assertStatus(302)
    response.assertHeader('location', '/dashboard')
  })

  test('lists delivery streams for admins', async ({ client }) => {
    const admin = await createAdminUser()
    await DeliveryStream.createMany([
      { name: 'payments', displayName: 'Payments', isActive: true },
      { name: 'onboarding', displayName: 'Onboarding', isActive: true },
    ])

    const response = await client.get('/admin/streams/delivery').loginAs(admin)
    response.assertStatus(200)
    response.assertTextIncludes('Payments')
    response.assertTextIncludes('Onboarding')
  })
})

test.group('Admin | Delivery Streams | create', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('shows create form for admins', async ({ client }) => {
    const admin = await createAdminUser()
    const response = await client.get('/admin/streams/delivery/create').loginAs(admin)
    response.assertStatus(200)
    response.assertTextIncludes('New Delivery Stream')
  })

  test('creates a delivery stream with valid data', async ({ client, assert }) => {
    const admin = await createAdminUser()

    const response = await client
      .post('/admin/streams/delivery')
      .loginAs(admin)
      .withCsrfToken()
      .fields({
        name: 'payments',
        displayName: 'Payments',
        description: 'Payments delivery stream',
      })
      .redirects(0)

    response.assertStatus(302)

    const stream = await DeliveryStream.findByOrFail('name', 'payments')
    assert.equal(stream.displayName, 'Payments')
    assert.equal(stream.description, 'Payments delivery stream')
    assert.isTrue(stream.isActive)
  })

  test('rejects duplicate stream names', async ({ client }) => {
    const admin = await createAdminUser()
    await DeliveryStream.create({ name: 'payments', displayName: 'Payments', isActive: true })

    const response = await client
      .post('/admin/streams/delivery')
      .loginAs(admin)
      .withCsrfToken()
      .fields({ name: 'payments', displayName: 'Payments Again' })
      .redirects(0)

    response.assertStatus(302)
    response.assertHeader('location', '/admin/streams/delivery/create')
  })

  test('rejects missing display name', async ({ client }) => {
    const admin = await createAdminUser()

    const response = await client
      .post('/admin/streams/delivery')
      .loginAs(admin)
      .withCsrfToken()
      .fields({ name: 'payments' })
      .redirects(0)

    response.assertStatus(302)
    response.assertHeader('location', '/admin/streams/delivery/create')
  })
})

test.group('Admin | Delivery Streams | edit', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('renders edit form for admin', async ({ client }) => {
    const admin = await createAdminUser()
    const stream = await DeliveryStream.create({
      name: 'payments',
      displayName: 'Payments',
      isActive: true,
    })

    const response = await client
      .get(`/admin/streams/delivery/${stream.id}/edit`)
      .loginAs(admin)

    response.assertStatus(200)
    response.assertTextIncludes('Payments')
  })

  test('returns 404 for non-existent stream on edit', async ({ client }) => {
    const admin = await createAdminUser()
    const response = await client.get('/admin/streams/delivery/99999/edit').loginAs(admin)
    response.assertStatus(404)
  })
})

test.group('Admin | Delivery Streams | update', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('updates a delivery stream', async ({ client, assert }) => {
    const admin = await createAdminUser()
    const stream = await DeliveryStream.create({
      name: 'payments',
      displayName: 'Payments',
      isActive: true,
    })

    const response = await client
      .post(`/admin/streams/delivery/${stream.id}?_method=PUT`)
      .loginAs(admin)
      .withCsrfToken()
      .fields({
        name: 'payments',
        displayName: 'Payments Updated',
        description: 'Updated description',
      })
      .redirects(0)

    response.assertStatus(302)

    await stream.refresh()
    assert.equal(stream.displayName, 'Payments Updated')
  })

  test('returns 404 for non-existent stream', async ({ client }) => {
    const admin = await createAdminUser()

    const response = await client
      .post('/admin/streams/delivery/99999?_method=PUT')
      .loginAs(admin)
      .withCsrfToken()
      .fields({ name: 'test', displayName: 'Test' })

    response.assertStatus(404)
  })

  test('redirects back to edit form on validation error', async ({ client }) => {
    const admin = await createAdminUser()
    const stream = await DeliveryStream.create({
      name: 'payments',
      displayName: 'Payments',
      isActive: true,
    })

    const response = await client
      .post(`/admin/streams/delivery/${stream.id}?_method=PUT`)
      .loginAs(admin)
      .withCsrfToken()
      .fields({ name: 'payments', displayName: '' })
      .redirects(0)

    response.assertStatus(302)
    response.assertHeader('location', `/admin/streams/delivery/${stream.id}/edit`)
  })
})

test.group('Admin | Delivery Streams | delete', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('deletes a delivery stream', async ({ client, assert }) => {
    const admin = await createAdminUser()
    const stream = await DeliveryStream.create({
      name: 'payments',
      displayName: 'Payments',
      isActive: true,
    })

    const response = await client
      .post(`/admin/streams/delivery/${stream.id}?_method=DELETE`)
      .loginAs(admin)
      .withCsrfToken()
      .redirects(0)

    response.assertStatus(302)

    const deleted = await DeliveryStream.find(stream.id)
    assert.isNull(deleted)
  })
})
