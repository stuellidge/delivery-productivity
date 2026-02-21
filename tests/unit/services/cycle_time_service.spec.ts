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
