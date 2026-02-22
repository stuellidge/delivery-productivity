import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import DeliveryStream from '#models/delivery_stream'
import WorkItemEvent from '#models/work_item_event'
import WorkItemCycle from '#models/work_item_cycle'
import ForecastSnapshot from '#models/forecast_snapshot'
import MonteCarloForecastService from '#services/monte_carlo_forecast_service'

async function seedDeliveryStream(name = 'team-alpha') {
  return DeliveryStream.create({
    name,
    displayName: 'Team Alpha',
    isActive: true,
    teamSize: null,
  })
}

async function seedActiveTicket(deliveryStreamId: number, ticketId: string, stage = 'dev') {
  return WorkItemEvent.create({
    source: 'jira',
    deliveryStreamId,
    eventType: 'transitioned',
    ticketId,
    toStage: stage as any,
    receivedAt: DateTime.now(),
    eventTimestamp: DateTime.now(),
  })
}

async function seedCompletedCycle(
  deliveryStreamId: number,
  ticketId: string,
  completedAt: DateTime
) {
  return WorkItemCycle.create({
    ticketId,
    deliveryStreamId,
    createdAtSource: completedAt.minus({ days: 10 }),
    completedAt,
    leadTimeDays: 10,
    cycleTimeDays: 8,
    activeTimeDays: 6,
    waitTimeDays: 2,
    flowEfficiencyPct: 75,
    stageDurations: {},
  })
}

test.group('MonteCarloForecastService | low confidence (< 6 weeks)', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns isLowConfidence=true when no throughput data', async ({ assert }) => {
    const ds = await seedDeliveryStream()
    const service = new MonteCarloForecastService(ds.id, 12)
    const result = await service.compute()
    assert.isTrue(result.isLowConfidence)
    assert.equal(result.weeksOfData, 0)
    assert.isNull(result.p50Date)
    assert.isNull(result.p85Date)
  })

  test('computes remainingScope from active-stage work items', async ({ assert }) => {
    const ds = await seedDeliveryStream()
    await seedActiveTicket(ds.id, 'TICK-1', 'dev')
    await seedActiveTicket(ds.id, 'TICK-2', 'qa')
    await seedActiveTicket(ds.id, 'TICK-3', 'done') // should be excluded

    const service = new MonteCarloForecastService(ds.id, 12)
    const result = await service.compute()
    assert.equal(result.remainingScope, 2)
  })

  test('computes linearProjectionWeeks when some data but < 6 weeks', async ({ assert }) => {
    const ds = await seedDeliveryStream()
    // Create 3 weeks of throughput data (< 6 weeks)
    const now = DateTime.now()
    await seedCompletedCycle(ds.id, 'TICK-1', now.minus({ days: 7 }))
    await seedCompletedCycle(ds.id, 'TICK-2', now.minus({ days: 14 }))
    await seedCompletedCycle(ds.id, 'TICK-3', now.minus({ days: 21 }))

    // 3 active items
    await seedActiveTicket(ds.id, 'TICK-4', 'dev')
    await seedActiveTicket(ds.id, 'TICK-5', 'ba')
    await seedActiveTicket(ds.id, 'TICK-6', 'qa')

    const service = new MonteCarloForecastService(ds.id, 12)
    const result = await service.compute()
    assert.isTrue(result.isLowConfidence)
    assert.isNotNull(result.linearProjectionWeeks)
    assert.isAbove(result.linearProjectionWeeks!, 0)
  })
})

test.group('MonteCarloForecastService | full simulation (≥ 6 weeks)', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns p50/p70/p85/p95 dates when sufficient data', async ({ assert }) => {
    const ds = await seedDeliveryStream()
    const now = DateTime.now()

    // Seed 8 weeks of throughput — 2 items per week
    for (let w = 1; w <= 8; w++) {
      await seedCompletedCycle(ds.id, `TICK-W${w}A`, now.minus({ weeks: w }).plus({ days: 1 }))
      await seedCompletedCycle(ds.id, `TICK-W${w}B`, now.minus({ weeks: w }).plus({ days: 3 }))
    }

    // 4 remaining items
    await seedActiveTicket(ds.id, 'TICK-R1', 'dev')
    await seedActiveTicket(ds.id, 'TICK-R2', 'qa')
    await seedActiveTicket(ds.id, 'TICK-R3', 'ba')
    await seedActiveTicket(ds.id, 'TICK-R4', 'backlog')

    const service = new MonteCarloForecastService(ds.id, 12)
    const result = await service.compute()

    assert.isFalse(result.isLowConfidence)
    assert.isAtLeast(result.weeksOfData, 6)
    assert.isNotNull(result.p50Date)
    assert.isNotNull(result.p70Date)
    assert.isNotNull(result.p85Date)
    assert.isNotNull(result.p95Date)
    assert.equal(result.simulationRuns, 10000)
    assert.isArray(result.distributionData)
  })

  test('p50 date is before p85 date (ordering)', async ({ assert }) => {
    const ds = await seedDeliveryStream()
    const now = DateTime.now()

    for (let w = 1; w <= 8; w++) {
      await seedCompletedCycle(ds.id, `TICK-ORD${w}A`, now.minus({ weeks: w }).plus({ days: 1 }))
      await seedCompletedCycle(ds.id, `TICK-ORD${w}B`, now.minus({ weeks: w }).plus({ days: 3 }))
    }
    await seedActiveTicket(ds.id, 'TICK-R1', 'dev')
    await seedActiveTicket(ds.id, 'TICK-R2', 'qa')

    const service = new MonteCarloForecastService(ds.id, 12)
    const result = await service.compute()

    assert.isFalse(result.isLowConfidence)
    const p50 = DateTime.fromISO(result.p50Date!)
    const p85 = DateTime.fromISO(result.p85Date!)
    assert.isTrue(p50 <= p85)
  })

  test('returns 0 remaining scope when no active tickets', async ({ assert }) => {
    const ds = await seedDeliveryStream()
    const now = DateTime.now()

    for (let w = 1; w <= 8; w++) {
      await seedCompletedCycle(ds.id, `TICK-E${w}`, now.minus({ weeks: w }).plus({ days: 2 }))
    }

    const service = new MonteCarloForecastService(ds.id, 12)
    const result = await service.compute()
    assert.equal(result.remainingScope, 0)
  })
})

test.group('MonteCarloForecastService | materialize', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('persists a forecast snapshot for today', async ({ assert }) => {
    const ds = await seedDeliveryStream('mat-forecast-ds')
    const now = DateTime.now()
    for (let w = 1; w <= 8; w++) {
      await seedCompletedCycle(ds.id, `MAT-W${w}A`, now.minus({ weeks: w }).plus({ days: 1 }))
      await seedCompletedCycle(ds.id, `MAT-W${w}B`, now.minus({ weeks: w }).plus({ days: 3 }))
    }
    await seedActiveTicket(ds.id, 'MAT-R1', 'dev')
    await seedActiveTicket(ds.id, 'MAT-R2', 'qa')

    const snapshot = await new MonteCarloForecastService(ds.id, 12).materialize()

    assert.equal(snapshot.deliveryStreamId, ds.id)
    assert.equal(snapshot.forecastDate, DateTime.now().toISODate()!)
    assert.equal(snapshot.scopeItemCount, 2)
    assert.isAtLeast(snapshot.throughputSamples, 6)
    assert.equal(snapshot.simulationRuns, 10000)
    assert.isNotNull(snapshot.p50CompletionDate)
    assert.isNotNull(snapshot.p85CompletionDate)
    assert.isArray(snapshot.distributionData)
    assert.isAbove(snapshot.distributionData!.length, 0)
  })

  test('upserts on re-run — no duplicate for same date + stream', async ({ assert }) => {
    const ds = await seedDeliveryStream('mat-forecast-upsert')
    const service = new MonteCarloForecastService(ds.id, 12)
    await service.materialize()
    await service.materialize()

    const today = DateTime.now().toISODate()!
    const rows = await ForecastSnapshot.query()
      .where('delivery_stream_id', ds.id)
      .where('forecast_date', today)
    assert.lengthOf(rows, 1)
  })

  test('stores low-confidence result with null completion dates', async ({ assert }) => {
    const ds = await seedDeliveryStream('mat-forecast-low-conf')
    const snapshot = await new MonteCarloForecastService(ds.id, 12).materialize()

    assert.equal(snapshot.scopeItemCount, 0)
    assert.isNull(snapshot.p50CompletionDate)
    assert.isNull(snapshot.p85CompletionDate)
    assert.isNull(snapshot.distributionData)
  })
})
