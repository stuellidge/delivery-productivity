import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { createHash } from 'node:crypto'
import { DateTime } from 'luxon'
import ApiKey from '#models/api_key'
import DeliveryStream from '#models/delivery_stream'
import WorkItemEvent from '#models/work_item_event'
import WorkItemCycle from '#models/work_item_cycle'
import { cache } from '#services/cache_service'

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

test.group('API | GET /api/v1/metrics/realtime', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())
  group.each.teardown(() => cache.clear())

  test('returns 401 without API key', async ({ client }) => {
    const response = await client.get('/api/v1/metrics/realtime')
    response.assertStatus(401)
  })

  test('returns 200 with correct envelope structure', async ({ client, assert }) => {
    await seedApiKey()

    const response = await client
      .get('/api/v1/metrics/realtime')
      .header('Authorization', `Bearer ${RAW_KEY}`)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.status, 'ok')
    assert.exists(body.data)
    assert.exists(body.data.wip_by_stage)
    assert.exists(body.data.cycle_time)
    assert.isNull(body.meta.stream_id)
    assert.exists(body.meta.computed_at)
  })

  test('returns WIP data from work_item_events', async ({ client, assert }) => {
    await seedApiKey()
    const now = DateTime.now()

    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-1',
      eventType: 'transitioned',
      eventTimestamp: now,
      toStage: 'dev',
    })

    const response = await client
      .get('/api/v1/metrics/realtime')
      .header('Authorization', `Bearer ${RAW_KEY}`)

    assert.equal(response.body().data.wip_by_stage.dev, 1)
  })

  test('filters by stream query param and sets stream_id in meta', async ({ client, assert }) => {
    await seedApiKey()
    const stream = await DeliveryStream.create({
      name: 'payments',
      displayName: 'Payments',
      isActive: true,
    })
    const now = DateTime.now()

    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-1',
      eventType: 'transitioned',
      eventTimestamp: now,
      toStage: 'dev',
      deliveryStreamId: stream.id,
    })

    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'ONB-1',
      eventType: 'transitioned',
      eventTimestamp: now,
      toStage: 'qa',
    })

    const response = await client
      .get(`/api/v1/metrics/realtime?stream=${stream.id}`)
      .header('Authorization', `Bearer ${RAW_KEY}`)

    const body = response.body()
    assert.equal(body.data.wip_by_stage.dev, 1)
    assert.isUndefined(body.data.wip_by_stage.qa)
    assert.equal(body.meta.stream_id, stream.id)
  })

  test('cycle_time includes count and percentile fields', async ({ client, assert }) => {
    await seedApiKey()
    const now = DateTime.now()

    await WorkItemCycle.create({
      ticketId: 'PAY-1',
      createdAtSource: now.minus({ days: 10 }),
      completedAt: now,
      leadTimeDays: 5,
      cycleTimeDays: 5,
      activeTimeDays: 5,
      waitTimeDays: 0,
      flowEfficiencyPct: 100,
      stageDurations: {},
    })

    const response = await client
      .get('/api/v1/metrics/realtime')
      .header('Authorization', `Bearer ${RAW_KEY}`)

    const ct = response.body().data.cycle_time
    assert.equal(ct.count, 1)
    assert.exists(ct.p50)
    assert.exists(ct.p85)
    assert.exists(ct.p95)
  })
})

test.group('API | GET /api/v1/metrics/diagnostic', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())
  group.each.teardown(() => cache.clear())

  test('returns 401 without API key', async ({ client }) => {
    const response = await client.get('/api/v1/metrics/diagnostic')
    response.assertStatus(401)
  })

  test('returns 200 with correct envelope structure and defaults', async ({ client, assert }) => {
    await seedApiKey()

    const response = await client
      .get('/api/v1/metrics/diagnostic')
      .header('Authorization', `Bearer ${RAW_KEY}`)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.status, 'ok')
    assert.exists(body.data.flow_efficiency)
    assert.equal(body.meta.window_days, 30)
    assert.isNull(body.meta.stream_id)
    assert.exists(body.meta.computed_at)
  })

  test('respects custom window query param', async ({ client, assert }) => {
    await seedApiKey()

    const response = await client
      .get('/api/v1/metrics/diagnostic?window=7')
      .header('Authorization', `Bearer ${RAW_KEY}`)

    assert.equal(response.body().meta.window_days, 7)
  })

  test('returns flow efficiency data from work_item_cycles', async ({ client, assert }) => {
    await seedApiKey()
    const now = DateTime.now()

    await WorkItemCycle.create({
      ticketId: 'PAY-1',
      createdAtSource: now.minus({ days: 5 }),
      completedAt: now,
      leadTimeDays: 5,
      cycleTimeDays: 5,
      activeTimeDays: 4,
      waitTimeDays: 1,
      flowEfficiencyPct: 80,
      stageDurations: { dev: 4 },
    })

    const response = await client
      .get('/api/v1/metrics/diagnostic')
      .header('Authorization', `Bearer ${RAW_KEY}`)

    const fe = response.body().data.flow_efficiency
    assert.approximately(fe.avgFlowEfficiencyPct, 80, 0.01)
    assert.equal(fe.count, 1)
  })

  test('filters by stream query param', async ({ client, assert }) => {
    await seedApiKey()
    const stream = await DeliveryStream.create({
      name: 'payments',
      displayName: 'Payments',
      isActive: true,
    })
    const now = DateTime.now()

    await WorkItemCycle.create({
      ticketId: 'PAY-1',
      deliveryStreamId: stream.id,
      createdAtSource: now.minus({ days: 5 }),
      completedAt: now,
      leadTimeDays: 5,
      cycleTimeDays: 5,
      activeTimeDays: 5,
      waitTimeDays: 0,
      flowEfficiencyPct: 100,
      stageDurations: {},
    })

    await WorkItemCycle.create({
      ticketId: 'ONB-1',
      deliveryStreamId: null,
      createdAtSource: now.minus({ days: 5 }),
      completedAt: now,
      leadTimeDays: 2,
      cycleTimeDays: 2,
      activeTimeDays: 1,
      waitTimeDays: 1,
      flowEfficiencyPct: 50,
      stageDurations: {},
    })

    const response = await client
      .get(`/api/v1/metrics/diagnostic?stream=${stream.id}`)
      .header('Authorization', `Bearer ${RAW_KEY}`)

    const body = response.body()
    assert.equal(body.data.flow_efficiency.count, 1)
    assert.approximately(body.data.flow_efficiency.avgFlowEfficiencyPct, 100, 0.01)
    assert.equal(body.meta.stream_id, stream.id)
  })

  test('diagnostic response includes defect_escape field', async ({ client, assert }) => {
    await seedApiKey()

    const response = await client
      .get('/api/v1/metrics/diagnostic')
      .header('Authorization', `Bearer ${RAW_KEY}`)

    response.assertStatus(200)
    const body = response.body()
    assert.exists(body.data.defect_escape)
    assert.isDefined(body.data.defect_escape.escapeRatePct)
    assert.isDefined(body.data.defect_escape.count)
  })

  test('diagnostic response includes pr_review_turnaround field', async ({ client, assert }) => {
    await seedApiKey()

    const response = await client
      .get('/api/v1/metrics/diagnostic')
      .header('Authorization', `Bearer ${RAW_KEY}`)

    response.assertStatus(200)
    const body = response.body()
    assert.exists(body.data.pr_review_turnaround)
    assert.isDefined(body.data.pr_review_turnaround.p50)
    assert.isDefined(body.data.pr_review_turnaround.p85)
  })
})
