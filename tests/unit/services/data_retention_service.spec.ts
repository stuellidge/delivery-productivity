import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import WorkItemEvent from '#models/work_item_event'
import WorkItemCycle from '#models/work_item_cycle'
import PulseResponse from '#models/pulse_response'
import ForecastSnapshot from '#models/forecast_snapshot'
import DeliveryStream from '#models/delivery_stream'
import PlatformSetting from '#models/platform_setting'
import DataRetentionService from '#services/data_retention_service'

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function seedWorkItemEvent(ticketId: string, eventTimestamp: DateTime) {
  return WorkItemEvent.create({
    source: 'jira',
    ticketId,
    eventType: 'created',
    eventTimestamp,
  })
}

async function seedWorkItemCycle(ticketId: string, completedAt: DateTime) {
  return WorkItemCycle.create({
    ticketId,
    completedAt,
    createdAtSource: completedAt.minus({ days: 5 }),
    leadTimeDays: 5,
    cycleTimeDays: 3,
    activeTimeDays: 3,
    waitTimeDays: 0,
    flowEfficiencyPct: 100,
    stageDurations: {},
  })
}

async function seedPulseResponse(deliveryStreamId: number, receivedAt: DateTime) {
  return PulseResponse.create({
    source: 'web',
    deliveryStreamId,
    surveyPeriod: receivedAt.toFormat('yyyy-MM'),
    respondentHash: `hash-${receivedAt.toMillis()}`,
    paceScore: 3,
    toolingScore: 3,
    clarityScore: 3,
    receivedAt,
    eventTimestamp: receivedAt,
  })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.group('DataRetentionService', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('deletes work_item_events older than 24 months', async ({ assert }) => {
    const now = DateTime.now()
    await seedWorkItemEvent('PAY-OLD', now.minus({ months: 25 }))
    await seedWorkItemEvent('PAY-NEW', now.minus({ months: 5 }))

    const results = await new DataRetentionService().run()

    const old = await WorkItemEvent.findBy('ticketId', 'PAY-OLD')
    const recent = await WorkItemEvent.findBy('ticketId', 'PAY-NEW')

    assert.isNull(old)
    assert.isNotNull(recent)

    const wiEvents = results.find((r) => r.table === 'work_item_events')
    assert.isDefined(wiEvents)
    assert.equal(wiEvents!.rowsDeleted, 1)
  })

  test('deletes work_item_cycles older than 36 months', async ({ assert }) => {
    const now = DateTime.now()
    await seedWorkItemCycle('PAY-OLD', now.minus({ months: 37 }))
    await seedWorkItemCycle('PAY-NEW', now.minus({ months: 6 }))

    await new DataRetentionService().run()

    const old = await WorkItemCycle.findBy('ticketId', 'PAY-OLD')
    const recent = await WorkItemCycle.findBy('ticketId', 'PAY-NEW')

    assert.isNull(old)
    assert.isNotNull(recent)
  })

  test('deletes pulse_responses older than 12 months', async ({ assert }) => {
    const stream = await DeliveryStream.create({
      name: 'pay',
      displayName: 'Pay',
      isActive: true,
    })
    const now = DateTime.now()
    await seedPulseResponse(stream.id, now.minus({ months: 13 }))
    await seedPulseResponse(stream.id, now.minus({ months: 3 }))

    await new DataRetentionService().run()

    const rows = await PulseResponse.query().where('deliveryStreamId', stream.id)
    assert.equal(rows.length, 1)
    assert.approximately(
      DateTime.now().diff(rows[0].receivedAt, 'months').months,
      3,
      1
    )
  })

  test('keeps rows within the retention window', async ({ assert }) => {
    const now = DateTime.now()
    // Seed at exactly 23 months — should be kept (< 24 months)
    await seedWorkItemEvent('PAY-EDGE', now.minus({ months: 23 }))

    await new DataRetentionService().run()

    const row = await WorkItemEvent.findBy('ticketId', 'PAY-EDGE')
    assert.isNotNull(row)
  })

  test('returns per-table deletion counts', async ({ assert }) => {
    const now = DateTime.now()
    await seedWorkItemEvent('PAY-1', now.minus({ months: 25 }))
    await seedWorkItemEvent('PAY-2', now.minus({ months: 26 }))
    await seedWorkItemEvent('PAY-KEEP', now.minus({ months: 5 }))

    const results = await new DataRetentionService().run()

    assert.isArray(results)
    const wiEvents = results.find((r) => r.table === 'work_item_events')
    assert.isDefined(wiEvents)
    assert.equal(wiEvents!.rowsDeleted, 2)
  })

  test('reads custom retention periods from platform_settings', async ({ assert }) => {
    const now = DateTime.now()
    // Seed a pulse_response at 8 months — normally kept (12-month default), but with custom 6-month config it should be deleted
    const stream = await DeliveryStream.create({ name: 'pay2', displayName: 'Pay2', isActive: true })
    await seedPulseResponse(stream.id, now.minus({ months: 8 }))

    // Override retention config: pulse_responses = 6 months
    await PlatformSetting.updateOrCreate(
      { key: 'data_retention_months' },
      {
        value: { pulse_responses: 6 },
        description: 'Test override',
      }
    )

    await new DataRetentionService().run()

    const rows = await PulseResponse.query().where('deliveryStreamId', stream.id)
    assert.equal(rows.length, 0)
  })

  test('updates last_data_retention_run in platform_settings after run', async ({ assert }) => {
    await new DataRetentionService().run()

    const setting = await PlatformSetting.findBy('key', 'last_data_retention_run')
    assert.isNotNull(setting)
    assert.isString(setting!.value)
    assert.match(String(setting!.value), /^\d{4}-\d{2}-\d{2}T/)
  })

  test('deletes forecast_snapshots older than 12 months', async ({ assert }) => {
    const stream = await DeliveryStream.create({ name: 'fs-pay', displayName: 'FS Pay', isActive: true })
    const now = DateTime.now()

    await ForecastSnapshot.create({
      deliveryStreamId: stream.id,
      forecastDate: now.minus({ months: 13 }).toISODate()!,
      scopeItemCount: 10,
      throughputSamples: 5,
      simulationRuns: 1000,
      computedAt: now.minus({ months: 13 }),
    })

    await ForecastSnapshot.create({
      deliveryStreamId: stream.id,
      forecastDate: now.minus({ months: 3 }).toISODate()!,
      scopeItemCount: 10,
      throughputSamples: 5,
      simulationRuns: 1000,
      computedAt: now.minus({ months: 3 }),
    })

    await new DataRetentionService().run()

    const rows = await ForecastSnapshot.query().where('deliveryStreamId', stream.id)
    assert.equal(rows.length, 1)
    assert.approximately(
      DateTime.now().diff(rows[0].computedAt, 'months').months,
      3,
      1
    )
  })
})
