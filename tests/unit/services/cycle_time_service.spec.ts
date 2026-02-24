import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import WorkItemCycle from '#models/work_item_cycle'
import DeliveryStream from '#models/delivery_stream'
import CycleTimeService from '#services/cycle_time_service'

test.group('CycleTimeService', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns zero percentiles when no cycles in window', async ({ assert }) => {
    const service = new CycleTimeService()
    const result = await service.compute()

    assert.equal(result.count, 0)
    assert.equal(result.p50, 0)
    assert.equal(result.p85, 0)
    assert.equal(result.p95, 0)
  })

  test('computes p50, p85, p95 from cycle_time_days', async ({ assert }) => {
    const now = DateTime.now()

    for (let i = 1; i <= 10; i++) {
      await WorkItemCycle.create({
        ticketId: `PAY-${i}`,
        createdAtSource: now.minus({ days: 30 }),
        completedAt: now,
        leadTimeDays: i,
        cycleTimeDays: i,
        activeTimeDays: i,
        waitTimeDays: 0,
        flowEfficiencyPct: 100,
        stageDurations: {},
      })
    }

    const service = new CycleTimeService()
    const result = await service.compute()

    assert.equal(result.count, 10)
    // Sorted [1..10]: p50 idx=4.5 → 5.5, p85 idx=7.65 → 8.65, p95 idx=8.55 → 9.55
    assert.approximately(result.p50, 5.5, 0.01)
    assert.approximately(result.p85, 8.65, 0.01)
    assert.approximately(result.p95, 9.55, 0.01)
  })

  test('filters by rolling window (default 30 days)', async ({ assert }) => {
    const now = DateTime.now()

    // Within window (10 days ago)
    await WorkItemCycle.create({
      ticketId: 'PAY-1',
      createdAtSource: now.minus({ days: 20 }),
      completedAt: now.minus({ days: 10 }),
      leadTimeDays: 5,
      cycleTimeDays: 5,
      activeTimeDays: 5,
      waitTimeDays: 0,
      flowEfficiencyPct: 100,
      stageDurations: {},
    })

    // Outside window (40 days ago)
    await WorkItemCycle.create({
      ticketId: 'PAY-2',
      createdAtSource: now.minus({ days: 60 }),
      completedAt: now.minus({ days: 40 }),
      leadTimeDays: 20,
      cycleTimeDays: 20,
      activeTimeDays: 20,
      waitTimeDays: 0,
      flowEfficiencyPct: 100,
      stageDurations: {},
    })

    const service = new CycleTimeService()
    const result = await service.compute()

    assert.equal(result.count, 1)
    assert.approximately(result.p50, 5, 0.01)
  })

  test('respects custom window size in days', async ({ assert }) => {
    const now = DateTime.now()

    await WorkItemCycle.create({
      ticketId: 'PAY-1',
      createdAtSource: now.minus({ days: 10 }),
      completedAt: now.minus({ days: 5 }),
      leadTimeDays: 3,
      cycleTimeDays: 3,
      activeTimeDays: 3,
      waitTimeDays: 0,
      flowEfficiencyPct: 100,
      stageDurations: {},
    })

    await WorkItemCycle.create({
      ticketId: 'PAY-2',
      createdAtSource: now.minus({ days: 20 }),
      completedAt: now.minus({ days: 15 }),
      leadTimeDays: 7,
      cycleTimeDays: 7,
      activeTimeDays: 7,
      waitTimeDays: 0,
      flowEfficiencyPct: 100,
      stageDurations: {},
    })

    const service = new CycleTimeService()
    // 7-day window should only include PAY-1
    const result = await service.compute(undefined, 7)

    assert.equal(result.count, 1)
    assert.approximately(result.p50, 3, 0.01)
  })

  test('returns exact value when percentile index falls on an integer', async ({ assert }) => {
    // 3 items [1,2,3]: p50 idx = 0.5 * 2 = 1.0 → lower===upper → sorted[1] = 2
    const now = DateTime.now()

    for (let i = 1; i <= 3; i++) {
      await WorkItemCycle.create({
        ticketId: `PAY-${i}`,
        createdAtSource: now.minus({ days: 10 }),
        completedAt: now,
        leadTimeDays: i,
        cycleTimeDays: i,
        activeTimeDays: i,
        waitTimeDays: 0,
        flowEfficiencyPct: 100,
        stageDurations: {},
      })
    }

    const service = new CycleTimeService()
    const result = await service.compute()

    assert.equal(result.count, 3)
    assert.approximately(result.p50, 2, 0.001)
  })

  test('filters by delivery stream when provided', async ({ assert }) => {
    const stream = await DeliveryStream.create({
      name: 'payments',
      displayName: 'Payments',
      isActive: true,
    })
    const now = DateTime.now()

    await WorkItemCycle.create({
      ticketId: 'PAY-1',
      deliveryStreamId: stream.id,
      createdAtSource: now.minus({ days: 10 }),
      completedAt: now,
      leadTimeDays: 3,
      cycleTimeDays: 3,
      activeTimeDays: 3,
      waitTimeDays: 0,
      flowEfficiencyPct: 100,
      stageDurations: {},
    })

    await WorkItemCycle.create({
      ticketId: 'ONB-1',
      deliveryStreamId: null,
      createdAtSource: now.minus({ days: 10 }),
      completedAt: now,
      leadTimeDays: 10,
      cycleTimeDays: 10,
      activeTimeDays: 10,
      waitTimeDays: 0,
      flowEfficiencyPct: 100,
      stageDurations: {},
    })

    const service = new CycleTimeService()
    const result = await service.compute(stream.id)

    assert.equal(result.count, 1)
    assert.approximately(result.p50, 3, 0.01)
  })
})

// ─── getScatterData ──────────────────────────────────────────────────────────

test.group('CycleTimeService.getScatterData', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  async function seedCycle(
    ticketId: string,
    cycleTimeDays: number,
    completedDaysAgo: number,
    deliveryStreamId?: number,
    ticketType?: string
  ) {
    const now = DateTime.now()
    return WorkItemCycle.create({
      ticketId,
      deliveryStreamId: deliveryStreamId ?? null,
      createdAtSource: now.minus({ days: completedDaysAgo + 5 }),
      completedAt: now.minus({ days: completedDaysAgo }),
      leadTimeDays: cycleTimeDays + 2,
      cycleTimeDays,
      activeTimeDays: cycleTimeDays * 0.5,
      waitTimeDays: cycleTimeDays * 0.5,
      flowEfficiencyPct: 50,
      stageDurations: {},
      ticketType: ticketType ?? null,
    })
  }

  test('returns empty array when no cycles in window', async ({ assert }) => {
    const result = await new CycleTimeService().getScatterData()
    assert.deepEqual(result, [])
  })

  test('returns correct fields for each scatter point', async ({ assert }) => {
    await seedCycle('PAY-1', 4, 5)

    const result = await new CycleTimeService().getScatterData()

    assert.equal(result.length, 1)
    assert.equal(result[0].ticketId, 'PAY-1')
    assert.equal(result[0].cycleTimeDays, 4)
    assert.isString(result[0].completedAt)
    assert.match(result[0].completedAt, /^\d{4}-\d{2}-\d{2}T/)
    assert.property(result[0], 'ticketType')
  })

  test('includes ticketType when set', async ({ assert }) => {
    await seedCycle('PAY-2', 3, 2, undefined, 'story')

    const result = await new CycleTimeService().getScatterData()
    assert.equal(result[0].ticketType, 'story')
  })

  test('excludes items outside the rolling window', async ({ assert }) => {
    await seedCycle('PAY-IN', 3, 10)
    await seedCycle('PAY-OUT', 5, 40) // outside default 30-day window

    const result = await new CycleTimeService().getScatterData()
    assert.equal(result.length, 1)
    assert.equal(result[0].ticketId, 'PAY-IN')
  })

  test('respects custom window size', async ({ assert }) => {
    await seedCycle('PAY-1', 3, 5)
    await seedCycle('PAY-2', 4, 15) // outside 7-day window

    const result = await new CycleTimeService().getScatterData(undefined, 7)
    assert.equal(result.length, 1)
    assert.equal(result[0].ticketId, 'PAY-1')
  })

  test('caps results at the specified limit', async ({ assert }) => {
    for (let i = 1; i <= 10; i++) {
      await seedCycle(`PAY-${i}`, i, i)
    }

    const result = await new CycleTimeService().getScatterData(undefined, 30, 5)
    assert.equal(result.length, 5)
  })

  test('returns items in ascending completedAt order', async ({ assert }) => {
    await seedCycle('PAY-OLD', 3, 10)
    await seedCycle('PAY-NEW', 5, 2)

    const result = await new CycleTimeService().getScatterData()
    assert.equal(result.length, 2)
    const t0 = DateTime.fromISO(result[0].completedAt)
    const t1 = DateTime.fromISO(result[1].completedAt)
    assert.isTrue(t0.toMillis() < t1.toMillis())
  })

  test('filters by delivery stream when provided', async ({ assert }) => {
    const stream = await DeliveryStream.create({ name: 'pay', displayName: 'Pay', isActive: true })
    await seedCycle('PAY-1', 3, 5, stream.id)
    await seedCycle('ONB-1', 8, 5, undefined)

    const result = await new CycleTimeService().getScatterData(stream.id)
    assert.equal(result.length, 1)
    assert.equal(result[0].ticketId, 'PAY-1')
  })
})
