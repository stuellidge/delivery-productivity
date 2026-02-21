import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import WorkItemCycle from '#models/work_item_cycle'
import DeliveryStream from '#models/delivery_stream'
import FlowEfficiencyService from '#services/flow_efficiency_service'

test.group('FlowEfficiencyService', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns null efficiency and empty stage durations when no cycles exist', async ({
    assert,
  }) => {
    const service = new FlowEfficiencyService()
    const result = await service.compute()

    assert.equal(result.count, 0)
    assert.isNull(result.avgFlowEfficiencyPct)
    assert.deepEqual(result.avgStageDurations, {})
  })

  test('computes average flow efficiency from work_item_cycles', async ({ assert }) => {
    const now = DateTime.now()

    await WorkItemCycle.create({
      ticketId: 'PAY-1',
      createdAtSource: now.minus({ days: 10 }),
      completedAt: now,
      leadTimeDays: 5,
      cycleTimeDays: 5,
      activeTimeDays: 4,
      waitTimeDays: 1,
      flowEfficiencyPct: 80,
      stageDurations: { dev: 4, backlog: 1 },
    })

    await WorkItemCycle.create({
      ticketId: 'PAY-2',
      createdAtSource: now.minus({ days: 15 }),
      completedAt: now,
      leadTimeDays: 10,
      cycleTimeDays: 10,
      activeTimeDays: 6,
      waitTimeDays: 4,
      flowEfficiencyPct: 60,
      stageDurations: { dev: 6, backlog: 4 },
    })

    const service = new FlowEfficiencyService()
    const result = await service.compute()

    assert.equal(result.count, 2)
    // (80 + 60) / 2 = 70
    assert.approximately(result.avgFlowEfficiencyPct!, 70, 0.01)
    // avg dev: (4 + 6) / 2 = 5
    assert.approximately(result.avgStageDurations['dev'], 5, 0.01)
    // avg backlog: (1 + 4) / 2 = 2.5
    assert.approximately(result.avgStageDurations['backlog'], 2.5, 0.01)
  })

  test('handles items with different stage sets in stage_durations', async ({ assert }) => {
    const now = DateTime.now()

    await WorkItemCycle.create({
      ticketId: 'PAY-1',
      createdAtSource: now.minus({ days: 5 }),
      completedAt: now,
      leadTimeDays: 3,
      cycleTimeDays: 3,
      activeTimeDays: 3,
      waitTimeDays: 0,
      flowEfficiencyPct: 100,
      stageDurations: { ba: 1, dev: 2 },
    })

    await WorkItemCycle.create({
      ticketId: 'PAY-2',
      createdAtSource: now.minus({ days: 5 }),
      completedAt: now,
      leadTimeDays: 4,
      cycleTimeDays: 4,
      activeTimeDays: 3,
      waitTimeDays: 1,
      flowEfficiencyPct: 75,
      stageDurations: { dev: 3, qa: 1 },
    })

    const service = new FlowEfficiencyService()
    const result = await service.compute()

    assert.equal(result.count, 2)
    // ba: only in PAY-1 → avg 1
    assert.approximately(result.avgStageDurations['ba'], 1, 0.01)
    // dev: PAY-1=2, PAY-2=3 → avg 2.5
    assert.approximately(result.avgStageDurations['dev'], 2.5, 0.01)
    // qa: only in PAY-2 → avg 1
    assert.approximately(result.avgStageDurations['qa'], 1, 0.01)
  })

  test('filters by rolling window (default 30 days)', async ({ assert }) => {
    const now = DateTime.now()

    // Within window
    await WorkItemCycle.create({
      ticketId: 'PAY-1',
      createdAtSource: now.minus({ days: 15 }),
      completedAt: now.minus({ days: 5 }),
      leadTimeDays: 5,
      cycleTimeDays: 5,
      activeTimeDays: 4,
      waitTimeDays: 1,
      flowEfficiencyPct: 80,
      stageDurations: { dev: 4 },
    })

    // Outside window
    await WorkItemCycle.create({
      ticketId: 'PAY-2',
      createdAtSource: now.minus({ days: 60 }),
      completedAt: now.minus({ days: 40 }),
      leadTimeDays: 10,
      cycleTimeDays: 10,
      activeTimeDays: 2,
      waitTimeDays: 8,
      flowEfficiencyPct: 20,
      stageDurations: { dev: 2, backlog: 8 },
    })

    const service = new FlowEfficiencyService()
    const result = await service.compute()

    assert.equal(result.count, 1)
    assert.approximately(result.avgFlowEfficiencyPct!, 80, 0.01)
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
      createdAtSource: now.minus({ days: 5 }),
      completedAt: now,
      leadTimeDays: 4,
      cycleTimeDays: 4,
      activeTimeDays: 4,
      waitTimeDays: 0,
      flowEfficiencyPct: 100,
      stageDurations: { dev: 4 },
    })

    await WorkItemCycle.create({
      ticketId: 'ONB-1',
      deliveryStreamId: null,
      createdAtSource: now.minus({ days: 5 }),
      completedAt: now,
      leadTimeDays: 5,
      cycleTimeDays: 5,
      activeTimeDays: 1,
      waitTimeDays: 4,
      flowEfficiencyPct: 20,
      stageDurations: { dev: 1, backlog: 4 },
    })

    const service = new FlowEfficiencyService()
    const result = await service.compute(stream.id)

    assert.equal(result.count, 1)
    assert.approximately(result.avgFlowEfficiencyPct!, 100, 0.01)
  })
})
