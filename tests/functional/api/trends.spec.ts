import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { createHash } from 'node:crypto'
import { DateTime } from 'luxon'
import ApiKey from '#models/api_key'
import TechStream from '#models/tech_stream'
import DeploymentRecord from '#models/deployment_record'

const RAW_KEY = 'test-trends-api-key'
const KEY_HASH = createHash('sha256').update(RAW_KEY).digest('hex')

async function seedApiKey() {
  return ApiKey.create({
    keyHash: KEY_HASH,
    displayName: 'Test Trends Key',
    permissions: [],
    isActive: true,
  })
}

test.group('API | GET /api/v1/metrics/trends', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns 401 without API key', async ({ client }) => {
    const response = await client.get('/api/v1/metrics/trends')
    response.assertStatus(401)
  })

  test('returns ok with correct DORA envelope structure', async ({ client, assert }) => {
    await seedApiKey()

    const response = await client
      .get('/api/v1/metrics/trends')
      .header('Authorization', `Bearer ${RAW_KEY}`)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.status, 'ok')
    assert.exists(body.data)
    assert.exists(body.data.dora)
    assert.isArray(body.data.dora)
    assert.exists(body.meta.window_days)
    assert.exists(body.meta.computed_at)
  })

  test('includes DORA metrics per active tech stream', async ({ client, assert }) => {
    await seedApiKey()
    const ts = await TechStream.create({
      name: 'backend',
      displayName: 'Backend',
      githubOrg: 'acme',
      githubInstallId: '99999',
      isActive: true,
    })

    await DeploymentRecord.create({
      techStreamId: ts.id,
      environment: 'production',
      status: 'success',
      deployedAt: DateTime.now().minus({ days: 5 }),
    })

    const response = await client
      .get('/api/v1/metrics/trends?window=30')
      .header('Authorization', `Bearer ${RAW_KEY}`)

    response.assertStatus(200)
    const body = response.body()
    const streamMetrics = body.data.dora.find((m: any) => m.techStreamId === ts.id)
    assert.isNotNull(streamMetrics)
    assert.exists(streamMetrics.deploymentFrequency)
    assert.exists(streamMetrics.changeFailureRate !== undefined)
    assert.equal(streamMetrics.techStreamName, 'Backend')
  })

  test('respects custom window_days parameter', async ({ client, assert }) => {
    await seedApiKey()

    const response = await client
      .get('/api/v1/metrics/trends?window=7')
      .header('Authorization', `Bearer ${RAW_KEY}`)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.meta.window_days, 7)
  })
})
