import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { createHash } from 'node:crypto'
import { DateTime } from 'luxon'
import ApiKey from '#models/api_key'
import DeliveryStream from '#models/delivery_stream'
import PulseAggregate from '#models/pulse_aggregate'

const RAW_KEY = 'test-api-key-pulse'
const KEY_HASH = createHash('sha256').update(RAW_KEY).digest('hex')

async function seedApiKey() {
  return ApiKey.create({
    keyHash: KEY_HASH,
    displayName: 'Pulse Key',
    permissions: ['metrics:read'],
    isActive: true,
  })
}

async function seedDeliveryStream() {
  return DeliveryStream.create({
    name: `pulse-ds-${Date.now()}`,
    displayName: 'Pulse Stream',
    isActive: true,
    teamSize: 8,
  })
}

test.group('API | GET /api/v1/metrics/pulse', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns 401 without API key', async ({ client }) => {
    const response = await client.get('/api/v1/metrics/pulse')
    response.assertStatus(401)
  })

  test('returns 200 with empty aggregates when none exist', async ({ client, assert }) => {
    await seedApiKey()
    const ds = await seedDeliveryStream()

    const response = await client
      .get(`/api/v1/metrics/pulse?stream=${ds.id}`)
      .header('Authorization', `Bearer ${RAW_KEY}`)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.status, 'ok')
    assert.isArray(body.data.aggregates)
    assert.equal(body.data.aggregates.length, 0)
  })

  test('returns pulse aggregates for delivery stream', async ({ client, assert }) => {
    await seedApiKey()
    const ds = await seedDeliveryStream()

    await PulseAggregate.create({
      deliveryStreamId: ds.id,
      surveyPeriod: '2026-01',
      responseCount: 5,
      teamSize: 8,
      responseRatePct: 62.5,
      paceAvg: 3.5,
      paceTrend: null,
      toolingAvg: 4.0,
      toolingTrend: null,
      clarityAvg: 3.8,
      clarityTrend: null,
      overallAvg: 3.77,
      computedAt: DateTime.now(),
    })

    const response = await client
      .get(`/api/v1/metrics/pulse?stream=${ds.id}&periods=3`)
      .header('Authorization', `Bearer ${RAW_KEY}`)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.data.aggregates.length, 1)
    assert.equal(body.data.aggregates[0].surveyPeriod, '2026-01')
  })
})
