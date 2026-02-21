import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { createHash } from 'node:crypto'
import ApiKey from '#models/api_key'
import TechStream from '#models/tech_stream'

const RAW_KEY = 'test-api-key-cross'
const KEY_HASH = createHash('sha256').update(RAW_KEY).digest('hex')

async function seedApiKey() {
  return ApiKey.create({
    keyHash: KEY_HASH,
    displayName: 'Cross-stream Key',
    permissions: ['metrics:read'],
    isActive: true,
  })
}

async function seedTechStream(name: string) {
  return TechStream.create({
    name,
    displayName: name,
    githubOrg: `org-cs-${name}`,
    githubInstallId: '77777',
    isActive: true,
  })
}

test.group('API | GET /api/v1/metrics/cross-stream', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns 401 without API key', async ({ client }) => {
    const response = await client.get('/api/v1/metrics/cross-stream')
    response.assertStatus(401)
  })

  test('returns 200 with correlations for all streams when no tech_stream param', async ({
    client,
    assert,
  }) => {
    await seedApiKey()
    await seedTechStream('cross-ts1')
    await seedTechStream('cross-ts2')

    const response = await client
      .get('/api/v1/metrics/cross-stream')
      .header('Authorization', `Bearer ${RAW_KEY}`)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.status, 'ok')
    assert.isArray(body.data.correlations)
    assert.isAtLeast(body.data.correlations.length, 2)
  })

  test('returns single correlation when tech_stream param provided', async ({ client, assert }) => {
    await seedApiKey()
    const ts = await seedTechStream('cross-ts-single')

    const response = await client
      .get(`/api/v1/metrics/cross-stream?tech_stream=${ts.id}`)
      .header('Authorization', `Bearer ${RAW_KEY}`)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.status, 'ok')
    assert.isArray(body.data.correlations)
    assert.equal(body.data.correlations.length, 1)
    assert.equal(body.data.correlations[0].techStreamId, ts.id)
    assert.equal(body.data.correlations[0].blockCount14d, 0)
    assert.equal(body.data.correlations[0].severity, 'none')
  })
})
