import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import User from '#models/user'
import AuditLog from '#models/audit_log'
import AuditLogService from '#services/audit_log_service'

test.group('AuditLogService', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('record() creates an audit_log row', async ({ assert }) => {
    const user = await User.create({
      fullName: 'Test User',
      email: 'test@example.com',
      password: 'secret',
      isActive: true,
    })

    await new AuditLogService().record({
      actorUserId: user.id,
      actorEmail: user.email,
      action: 'login',
    })

    const rows = await AuditLog.all()
    assert.lengthOf(rows, 1)
    assert.equal(rows[0].actorUserId, user.id)
    assert.equal(rows[0].actorEmail, 'test@example.com')
    assert.equal(rows[0].action, 'login')
    assert.isNull(rows[0].entityType)
    assert.isNull(rows[0].entityId)
  })

  test('record() stores entity context when provided', async ({ assert }) => {
    const user = await User.create({
      fullName: 'Admin',
      email: 'admin@example.com',
      password: 'secret',
      isActive: true,
    })

    await new AuditLogService().record({
      actorUserId: user.id,
      actorEmail: user.email,
      action: 'delivery_stream.create',
      entityType: 'delivery_stream',
      entityId: '42',
      detail: { name: 'payments' },
    })

    const row = await AuditLog.query().orderBy('created_at', 'desc').firstOrFail()
    assert.equal(row.action, 'delivery_stream.create')
    assert.equal(row.entityType, 'delivery_stream')
    assert.equal(row.entityId, '42')
    assert.deepEqual(row.detail, { name: 'payments' })
  })

  test('record() allows null actorUserId for system or unauthenticated events', async ({
    assert,
  }) => {
    await new AuditLogService().record({
      actorUserId: null,
      actorEmail: 'system',
      action: 'webhook.jira.received',
    })

    const row = await AuditLog.query().firstOrFail()
    assert.isNull(row.actorUserId)
    assert.equal(row.actorEmail, 'system')
  })

  test('record() stores ip_address when provided', async ({ assert }) => {
    await new AuditLogService().record({
      actorUserId: null,
      actorEmail: 'test@example.com',
      action: 'login',
      ipAddress: '192.168.1.1',
    })

    const row = await AuditLog.query().firstOrFail()
    assert.equal(row.ipAddress, '192.168.1.1')
  })

  test('getRecent() returns rows ordered by created_at desc', async ({ assert }) => {
    const user = await User.create({
      fullName: 'User',
      email: 'u@example.com',
      password: 'x',
      isActive: true,
    })

    for (const [i, action] of (['login', 'logout', 'api_key.create'] as const).entries()) {
      await AuditLog.create({
        actorUserId: user.id,
        actorEmail: user.email,
        action,
        createdAt: DateTime.now().plus({ seconds: i }),
      })
    }

    const rows = await new AuditLogService().getRecent(10)
    assert.lengthOf(rows, 3)
    assert.equal(rows[0].action, 'api_key.create')
    assert.equal(rows[2].action, 'login')
  })

  test('getRecent() respects the limit parameter', async ({ assert }) => {
    for (let i = 0; i < 5; i++) {
      await AuditLog.create({
        actorUserId: null,
        actorEmail: 'system',
        action: `action_${i}`,
        createdAt: DateTime.now(),
      })
    }

    const rows = await new AuditLogService().getRecent(3)
    assert.lengthOf(rows, 3)
  })
})
