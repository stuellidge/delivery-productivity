import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { createHash } from 'node:crypto'
import ApiKey from '#models/api_key'

const RAW_KEY = 'test-api-key-admin-dq'
const KEY_HASH = createHash('sha256').update(RAW_KEY).digest('hex')

async function seedApiKey() {
  return ApiKey.create({
    keyHash: KEY_HASH,
    displayName: 'Admin DQ Key',
    permissions: ['metrics:read'],
    isActive: true,
  })
}

test.group('API | GET /api/v1/admin/data-quality', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns 401 without API key', async ({ client }) => {
    const response = await client.get('/api/v1/admin/data-quality')
    response.assertStatus(401)
  })

  test('returns 200 with data quality metrics structure', async ({ client, assert }) => {
    await seedApiKey()

    const response = await client
      .get('/api/v1/admin/data-quality')
      .header('Authorization', `Bearer ${RAW_KEY}`)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.status, 'ok')
    assert.exists(body.data)
    assert.isNumber(body.data.prLinkageRate)
    assert.isNumber(body.data.prTotal)
    assert.isNumber(body.data.ticketTaggingRate)
    assert.isNumber(body.data.ticketTotal)
    assert.isNumber(body.data.deploymentTraceabilityRate)
    assert.isNumber(body.data.deploymentTotal)
    assert.isArray(body.data.warnings)
    assert.exists(body.meta)
    assert.exists(body.meta.computed_at)
  })
})
