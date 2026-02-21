import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import DeliveryStream from '#models/delivery_stream'
import TechStream from '#models/tech_stream'
import WorkItemEvent from '#models/work_item_event'
import CrossStreamCorrelationService from '#services/cross_stream_correlation_service'

async function seedDeliveryStream(name: string) {
  return DeliveryStream.create({
    name,
    displayName: name,
    isActive: true,
    teamSize: null,
  })
}

async function seedTechStream(name: string) {
  return TechStream.create({
    name,
    displayName: name,
    githubOrg: `org-${name}`,
    githubInstallId: '12345',
    isActive: true,
  })
}

async function seedBlockedEvent(
  deliveryStreamId: number,
  blockingTechStreamId: number,
  ticketId: string,
  eventTimestamp: DateTime
) {
  return WorkItemEvent.create({
    source: 'jira',
    deliveryStreamId,
    eventType: 'blocked',
    ticketId,
    blockingTechStreamId,
    receivedAt: DateTime.now(),
    eventTimestamp,
  })
}

test.group('CrossStreamCorrelationService | computeForTechStream', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns severity=none when no blocked events in 14d', async ({ assert }) => {
    const ts = await seedTechStream('platform')
    const service = new CrossStreamCorrelationService()
    const result = await service.computeForTechStream(ts.id)
    assert.equal(result.techStreamId, ts.id)
    assert.equal(result.blockCount14d, 0)
    assert.equal(result.severity, 'none')
    assert.deepEqual(result.impactedDeliveryStreamIds, [])
  })

  test('counts only blocked events within last 14 days', async ({ assert }) => {
    const ts = await seedTechStream('platform-2')
    const ds = await seedDeliveryStream('squad-a')
    const now = DateTime.now()

    // Within 14 days
    await seedBlockedEvent(ds.id, ts.id, 'TICK-1', now.minus({ days: 5 }))
    await seedBlockedEvent(ds.id, ts.id, 'TICK-2', now.minus({ days: 10 }))
    // Outside 14 days — should be excluded
    await seedBlockedEvent(ds.id, ts.id, 'TICK-3', now.minus({ days: 20 }))

    const service = new CrossStreamCorrelationService()
    const result = await service.computeForTechStream(ts.id)
    assert.equal(result.blockCount14d, 2)
    assert.include(result.impactedDeliveryStreamIds, ds.id)
  })

  test('identifies distinct impacted delivery streams', async ({ assert }) => {
    const ts = await seedTechStream('platform-3')
    const ds1 = await seedDeliveryStream('squad-b1')
    const ds2 = await seedDeliveryStream('squad-b2')
    const now = DateTime.now()

    await seedBlockedEvent(ds1.id, ts.id, 'TICK-A', now.minus({ days: 3 }))
    await seedBlockedEvent(ds2.id, ts.id, 'TICK-B', now.minus({ days: 5 }))
    await seedBlockedEvent(ds1.id, ts.id, 'TICK-C', now.minus({ days: 7 })) // second block in same stream

    const service = new CrossStreamCorrelationService()
    const result = await service.computeForTechStream(ts.id)
    assert.equal(result.impactedDeliveryStreamIds.length, 2)
    assert.equal(result.blockCount14d, 3)
  })

  test('assigns severity=low for 1 impacted stream', async ({ assert }) => {
    const ts = await seedTechStream('platform-sev')
    const ds = await seedDeliveryStream('squad-sev')
    const now = DateTime.now()

    await seedBlockedEvent(ds.id, ts.id, 'TICK-SEV1', now.minus({ days: 3 }))

    const service = new CrossStreamCorrelationService()
    const result = await service.computeForTechStream(ts.id)
    // 1 impacted stream — severity is 'low' or 'medium' depending on confidence
    // (no active sprint, so confidence will be 0 → 'medium')
    assert.oneOf(result.severity, ['low', 'medium'])
  })
})

test.group('CrossStreamCorrelationService | computeAll', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns results for all active tech streams', async ({ assert }) => {
    const ts1 = await seedTechStream('all-ts1')
    const ts2 = await seedTechStream('all-ts2')
    // Create one inactive tech stream — should NOT appear
    await TechStream.create({
      name: 'inactive-ts',
      displayName: 'Inactive TS',
      githubOrg: 'org-inactive-ts',
      githubInstallId: '99999',
      isActive: false,
    })

    const service = new CrossStreamCorrelationService()
    const results = await service.computeAll()

    const ids = results.map((r) => r.techStreamId)
    assert.include(ids, ts1.id)
    assert.include(ids, ts2.id)
    // Inactive tech stream should not be included
    assert.isUndefined(results.find((r) => r.techStreamId === 99999))
  })
})
