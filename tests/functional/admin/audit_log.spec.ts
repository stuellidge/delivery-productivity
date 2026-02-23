import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import User from '#models/user'
import UserRole from '#models/user_role'
import AuditLog from '#models/audit_log'

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

test.group('Admin | Audit Log | index', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('redirects unauthenticated users to login', async ({ client }) => {
    const response = await client.get('/admin/audit-log').redirects(0)
    response.assertStatus(302)
    response.assertHeader('location', '/login')
  })

  test('returns 302 for non-admin users', async ({ client }) => {
    const viewer = await createViewerUser()
    const response = await client.get('/admin/audit-log').loginAs(viewer).redirects(0)
    response.assertStatus(302)
    response.assertHeader('location', '/dashboard')
  })

  test('shows audit log entries for admins', async ({ client }) => {
    const admin = await createAdminUser()
    await AuditLog.create({
      actorUserId: admin.id,
      actorEmail: admin.email,
      action: 'delivery_stream.create',
      entityType: 'delivery_stream',
      entityId: '1',
      createdAt: DateTime.now(),
    })

    const response = await client.get('/admin/audit-log').loginAs(admin)
    response.assertStatus(200)
    response.assertTextIncludes('delivery_stream.create')
    response.assertTextIncludes('admin@example.com')
  })

  test('renders empty state when no log entries exist', async ({ client }) => {
    const admin = await createAdminUser()
    const response = await client.get('/admin/audit-log').loginAs(admin)
    response.assertStatus(200)
    response.assertTextIncludes('Audit Log')
  })
})

test.group('Audit Log | generated on auth events', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('login success creates an audit log entry', async ({ client, assert }) => {
    await User.create({
      fullName: 'Test User',
      email: 'test@example.com',
      password: 'password123',
      isActive: true,
    })

    await client
      .post('/login')
      .withCsrfToken()
      .fields({ email: 'test@example.com', password: 'password123' })

    const row = await AuditLog.query().where('action', 'login').first()
    assert.isNotNull(row)
    assert.equal(row!.actorEmail, 'test@example.com')
  })

  test('login failure creates an audit log entry', async ({ client, assert }) => {
    await User.create({
      fullName: 'Test User',
      email: 'test@example.com',
      password: 'password123',
      isActive: true,
    })

    await client
      .post('/login')
      .withCsrfToken()
      .fields({ email: 'test@example.com', password: 'wrongpassword' })

    const row = await AuditLog.query().where('action', 'login.failed').first()
    assert.isNotNull(row)
    assert.equal(row!.actorEmail, 'test@example.com')
  })
})
