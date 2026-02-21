import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { createHash } from 'node:crypto'
import ApiKey from '#models/api_key'

const RAW_KEY = 'test-api-key-secret'
const KEY_HASH = createHash('sha256').update(RAW_KEY).digest('hex')

async function seedApiKey() {
  return ApiKey.create({
    keyHash: KEY_HASH,
    displayName: 'Test Key',
    permissions: ['metrics:read'],
    isActive: true,
  })
}

test.group('API | GET /api/v1/admin/system-alerts', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('unauthenticated API call returns 401', async ({ client }) => {
    const response = await client.get('/api/v1/admin/system-alerts')
    response.assertStatus(401)
  })

  test('valid API key returns list of active alert conditions', async ({ client, assert }) => {
    await seedApiKey()
    const response = await client
      .get('/api/v1/admin/system-alerts')
      .header('Authorization', `Bearer ${RAW_KEY}`)
    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.status, 'ok')
    assert.isArray(body.data.alerts)
  })

  test('returns 200 with expected envelope structure', async ({ client, assert }) => {
    await seedApiKey()
    const response = await client
      .get('/api/v1/admin/system-alerts')
      .header('Authorization', `Bearer ${RAW_KEY}`)
    response.assertStatus(200)
    const body = response.body()
    assert.property(body, 'status')
    assert.property(body, 'data')
    assert.property(body.data, 'alerts')
    assert.property(body, 'meta')
    assert.property(body.meta, 'computed_at')
  })

  test('each alert has condition, severity, and message fields', async ({ client, assert }) => {
    await seedApiKey()
    // Seed some data that triggers an alert
    const { default: DeploymentRecord } = await import('#models/deployment_record')
    const { default: TechStream } = await import('#models/tech_stream')
    const { DateTime } = await import('luxon')
    const ts = await TechStream.create({
      name: 'alert-ts',
      displayName: 'alert-ts',
      githubOrg: 'acme',
      githubInstallId: '999',
      isActive: true,
    })
    for (let i = 0; i < 4; i++) {
      await DeploymentRecord.create({
        techStreamId: ts.id,
        environment: 'production',
        status: 'success',
        linkedTicketId: null,
        causedIncident: false,
        deployedAt: DateTime.now(),
      })
    }
    const response = await client
      .get('/api/v1/admin/system-alerts')
      .header('Authorization', `Bearer ${RAW_KEY}`)
    const { alerts } = response.body().data
    for (const alert of alerts) {
      assert.isString(alert.condition)
      assert.isString(alert.severity)
      assert.isString(alert.message)
    }
  })
})
