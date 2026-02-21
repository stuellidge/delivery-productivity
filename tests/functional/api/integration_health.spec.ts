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

test.group('API | GET /api/v1/admin/integration-health', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('unauthenticated API call returns 401', async ({ client }) => {
    const response = await client.get('/api/v1/admin/integration-health')
    response.assertStatus(401)
  })

  test('valid API key returns integration health data', async ({ client, assert }) => {
    await seedApiKey()
    const response = await client
      .get('/api/v1/admin/integration-health')
      .header('Authorization', `Bearer ${RAW_KEY}`)
    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.status, 'ok')
    assert.isArray(body.data.sources)
    assert.isArray(body.data.webhookSources)
    assert.isArray(body.data.eventSources)
    assert.isString(body.data.computedAt)
  })

  test('each source entry has expected fields', async ({ client, assert }) => {
    await seedApiKey()
    const response = await client
      .get('/api/v1/admin/integration-health')
      .header('Authorization', `Bearer ${RAW_KEY}`)
    response.assertStatus(200)
    const { sources } = response.body().data
    for (const source of sources) {
      assert.isString(source.source)
      assert.isString(source.status)
      assert.include(['healthy', 'stale', 'no_data'], source.status)
      assert.isNumber(source.eventCountLastHour)
    }
  })
})
