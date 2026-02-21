import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { createHash } from 'node:crypto'
import { DateTime } from 'luxon'
import ApiKey from '#models/api_key'
import DeliveryStream from '#models/delivery_stream'
import WorkItemCycle from '#models/work_item_cycle'
import WorkItemEvent from '#models/work_item_event'

const RAW_KEY = 'test-api-key-forecast'
const KEY_HASH = createHash('sha256').update(RAW_KEY).digest('hex')

async function seedApiKey() {
  return ApiKey.create({
    keyHash: KEY_HASH,
    displayName: 'Forecast Key',
    permissions: ['metrics:read'],
    isActive: true,
  })
}

async function seedDeliveryStream() {
  return DeliveryStream.create({
    name: `fc-ds-${Date.now()}`,
    displayName: 'Forecast Stream',
    isActive: true,
    teamSize: null,
  })
}

test.group('API | GET /api/v1/metrics/forecast', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns 401 without API key', async ({ client }) => {
    const response = await client.get('/api/v1/metrics/forecast')
    response.assertStatus(401)
  })

  test('returns 200 with forecast structure for low-confidence case', async ({
    client,
    assert,
  }) => {
    await seedApiKey()
    const ds = await seedDeliveryStream()

    const response = await client
      .get(`/api/v1/metrics/forecast?stream=${ds.id}`)
      .header('Authorization', `Bearer ${RAW_KEY}`)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.status, 'ok')
    assert.exists(body.data.forecast)
    assert.isBoolean(body.data.forecast.isLowConfidence)
    assert.exists(body.meta)
  })

  test('returns 200 with full simulation when sufficient throughput data', async ({
    client,
    assert,
  }) => {
    await seedApiKey()
    const ds = await seedDeliveryStream()
    const now = DateTime.now()

    // Seed 8 weeks of throughput
    for (let w = 1; w <= 8; w++) {
      await WorkItemCycle.create({
        ticketId: `FC-W${w}A`,
        deliveryStreamId: ds.id,
        createdAtSource: now.minus({ weeks: w }),
        completedAt: now.minus({ weeks: w }).plus({ days: 2 }),
        leadTimeDays: 9,
        cycleTimeDays: 7,
        activeTimeDays: 5,
        waitTimeDays: 2,
        flowEfficiencyPct: 71,
        stageDurations: {},
      })
    }

    // Seed some active work items
    await WorkItemEvent.create({
      source: 'jira',
      deliveryStreamId: ds.id,
      eventType: 'transitioned',
      ticketId: 'FC-ACTIVE-1',
      toStage: 'dev',
      receivedAt: now,
      eventTimestamp: now,
    })

    const response = await client
      .get(`/api/v1/metrics/forecast?stream=${ds.id}&window=12`)
      .header('Authorization', `Bearer ${RAW_KEY}`)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.status, 'ok')
    assert.exists(body.data.forecast)
    assert.isNumber(body.data.forecast.remainingScope)
    assert.isNumber(body.data.forecast.weeksOfData)
  })
})
