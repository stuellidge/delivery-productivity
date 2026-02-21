import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import DeliveryStream from '#models/delivery_stream'
import Sprint from '#models/sprint'
import SprintSnapshot from '#models/sprint_snapshot'
import WorkItemCycle from '#models/work_item_cycle'
import SprintConfidenceService from '#services/sprint_confidence_service'

async function seedDeliveryStream(name = 'team-beta') {
  return DeliveryStream.create({
    name,
    displayName: 'Team Beta',
    isActive: true,
    teamSize: null,
  })
}

async function seedActiveSprint(deliveryStreamId: number, endDate: DateTime) {
  return Sprint.create({
    jiraSprintId: `SPRINT-${Date.now()}`,
    deliveryStreamId,
    name: 'Sprint 42',
    startDate: endDate.minus({ weeks: 2 }).toISODate()!,
    endDate: endDate.toISODate()!,
    state: 'active',
  })
}

async function seedSnapshot(sprintId: number, snapshotDate: DateTime, remainingCount: number) {
  return SprintSnapshot.create({
    sprintId,
    source: 'jira',
    snapshotDate: snapshotDate.toISODate()!,
    receivedAt: snapshotDate,
    eventTimestamp: snapshotDate,
    committedCount: 10,
    completedCount: 10 - remainingCount,
    remainingCount,
    addedAfterStart: 0,
    removedAfterStart: 0,
    wipBa: 0,
    wipDev: remainingCount,
    wipQa: 0,
    wipUat: 0,
  })
}

async function seedCycle(deliveryStreamId: number, ticketId: string, completedAt: DateTime) {
  return WorkItemCycle.create({
    ticketId,
    deliveryStreamId,
    createdAtSource: completedAt.minus({ days: 5 }),
    completedAt,
    leadTimeDays: 5,
    cycleTimeDays: 4,
    activeTimeDays: 3,
    waitTimeDays: 1,
    flowEfficiencyPct: 75,
    stageDurations: {},
  })
}

test.group('SprintConfidenceService | no active sprint', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns null sprint info when no active sprint', async ({ assert }) => {
    const ds = await seedDeliveryStream()
    const service = new SprintConfidenceService(ds.id)
    const result = await service.compute()
    assert.isNull(result.sprintId)
    assert.isNull(result.sprintName)
    assert.equal(result.confidence, 0)
    assert.isTrue(result.hasInsufficientData)
  })
})

test.group('SprintConfidenceService | active sprint, no throughput', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns hasInsufficientData=true when no cycle history', async ({ assert }) => {
    const ds = await seedDeliveryStream()
    const endDate = DateTime.now().plus({ days: 5 })
    const sprint = await seedActiveSprint(ds.id, endDate)
    await seedSnapshot(sprint.id, DateTime.now().minus({ days: 1 }), 5)

    const service = new SprintConfidenceService(ds.id)
    const result = await service.compute()
    assert.equal(result.sprintId, sprint.id)
    assert.isTrue(result.hasInsufficientData)
    assert.equal(result.confidence, 0)
  })
})

test.group('SprintConfidenceService | active sprint with throughput', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('computes confidence > 0 when team has throughput history', async ({ assert }) => {
    const ds = await seedDeliveryStream()
    const now = DateTime.now()
    const endDate = now.plus({ days: 5 })
    const sprint = await seedActiveSprint(ds.id, endDate)
    await seedSnapshot(sprint.id, now.minus({ days: 1 }), 2)

    // Seed 8 weeks of daily throughput (1 item/day)
    for (let d = 1; d <= 56; d++) {
      await seedCycle(ds.id, `TICK-CONF${d}`, now.minus({ days: d }))
    }

    const service = new SprintConfidenceService(ds.id)
    const result = await service.compute()
    assert.isFalse(result.hasInsufficientData)
    assert.isAbove(result.confidence, 0)
    assert.isAtMost(result.confidence, 100)
    assert.equal(result.sprintId, sprint.id)
    assert.equal(result.remainingCount, 2)
    assert.isAtLeast(result.workingDaysRemaining, 0)
  })

  test('returns high confidence when remaining count is low vs throughput', async ({ assert }) => {
    const ds = await seedDeliveryStream()
    const now = DateTime.now()
    const endDate = now.plus({ days: 10 })
    const sprint = await seedActiveSprint(ds.id, endDate)
    await seedSnapshot(sprint.id, now.minus({ days: 1 }), 1)

    // Seed throughput: 2 per day
    for (let d = 1; d <= 56; d++) {
      await seedCycle(ds.id, `TICK-HIGH${d}A`, now.minus({ days: d }))
      await seedCycle(ds.id, `TICK-HIGH${d}B`, now.minus({ days: d }).plus({ hours: 4 }))
    }

    const service = new SprintConfidenceService(ds.id)
    const result = await service.compute()
    assert.isAbove(result.confidence, 50)
  })
})
