import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import WorkItemEvent from '#models/work_item_event'
import DeliveryStream from '#models/delivery_stream'
import WipMetricsService from '#services/wip_metrics_service'

test.group('WipMetricsService', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns empty object when no work item events exist', async ({ assert }) => {
    const service = new WipMetricsService()
    const result = await service.compute()
    assert.deepEqual(result, {})
  })

  test('counts work items by their latest to_stage', async ({ assert }) => {
    const now = DateTime.now()

    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-1',
      eventType: 'transitioned',
      eventTimestamp: now,
      toStage: 'dev',
    })

    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-2',
      eventType: 'transitioned',
      eventTimestamp: now,
      toStage: 'qa',
    })

    const service = new WipMetricsService()
    const result = await service.compute()

    assert.equal(result['dev'], 1)
    assert.equal(result['qa'], 1)
  })

  test('excludes completed work items from WIP count', async ({ assert }) => {
    const now = DateTime.now()

    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-1',
      eventType: 'transitioned',
      eventTimestamp: now.minus({ hours: 2 }),
      toStage: 'dev',
    })

    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-1',
      eventType: 'completed',
      eventTimestamp: now,
    })

    const service = new WipMetricsService()
    const result = await service.compute()

    assert.isUndefined(result['dev'])
  })

  test('uses the latest transition event for stage determination', async ({ assert }) => {
    const now = DateTime.now()

    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-1',
      eventType: 'transitioned',
      eventTimestamp: now.minus({ hours: 2 }),
      toStage: 'dev',
    })

    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-1',
      eventType: 'transitioned',
      eventTimestamp: now,
      toStage: 'qa',
    })

    const service = new WipMetricsService()
    const result = await service.compute()

    assert.isUndefined(result['dev'])
    assert.equal(result['qa'], 1)
  })

  test('filters by delivery stream when deliveryStreamId provided', async ({ assert }) => {
    const stream1 = await DeliveryStream.create({
      name: 'payments',
      displayName: 'Payments',
      isActive: true,
    })
    const stream2 = await DeliveryStream.create({
      name: 'onboarding',
      displayName: 'Onboarding',
      isActive: true,
    })
    const now = DateTime.now()

    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-1',
      eventType: 'transitioned',
      eventTimestamp: now,
      toStage: 'dev',
      deliveryStreamId: stream1.id,
    })

    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'ONB-1',
      eventType: 'transitioned',
      eventTimestamp: now,
      toStage: 'qa',
      deliveryStreamId: stream2.id,
    })

    const service = new WipMetricsService()
    const result = await service.compute(stream1.id)

    assert.equal(result['dev'], 1)
    assert.isUndefined(result['qa'])
  })

  test('counts multiple items in the same stage', async ({ assert }) => {
    const now = DateTime.now()

    for (let i = 1; i <= 3; i++) {
      await WorkItemEvent.create({
        source: 'jira',
        ticketId: `PAY-${i}`,
        eventType: 'transitioned',
        eventTimestamp: now,
        toStage: 'dev',
      })
    }

    const service = new WipMetricsService()
    const result = await service.compute()

    assert.equal(result['dev'], 3)
  })
})
