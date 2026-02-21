import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import DefectEvent from '#models/defect_event'
import DeliveryStream from '#models/delivery_stream'
import DefectEscapeRateService from '#services/defect_escape_rate_service'

async function seedDeliveryStream(name = 'esc-ds') {
  return DeliveryStream.create({ name, displayName: name, isActive: true })
}

async function seedDefect(opts: {
  ticketId: string
  eventType?: 'logged' | 'attributed' | 'reclassified'
  foundInStage?: string
  introducedInStage?: string | null
  deliveryStreamId?: number | null
  daysAgo?: number
}) {
  return DefectEvent.create({
    source: 'jira',
    ticketId: opts.ticketId,
    eventType: opts.eventType ?? 'logged',
    foundInStage: opts.foundInStage ?? 'unknown',
    introducedInStage: opts.introducedInStage ?? null,
    deliveryStreamId: opts.deliveryStreamId ?? null,
    eventTimestamp: DateTime.now().minus({ days: opts.daysAgo ?? 1 }),
  })
}

test.group('DefectEscapeRateService | basic', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns zero escape rate when no defects exist', async ({ assert }) => {
    const service = new DefectEscapeRateService()
    const result = await service.compute()

    assert.equal(result.escapeRatePct, 0)
    assert.equal(result.count, 0)
  })

  test('counts UAT-discovered defects in escape rate numerator', async ({ assert }) => {
    await seedDefect({ ticketId: 'BUG-1', foundInStage: 'uat' })
    await seedDefect({ ticketId: 'BUG-2', foundInStage: 'uat' })
    await seedDefect({ ticketId: 'BUG-3', foundInStage: 'dev' })

    const service = new DefectEscapeRateService()
    const result = await service.compute()

    // 2 escaped (uat) out of 3 total = ~66.67%
    assert.equal(result.count, 3)
    assert.approximately(result.escapeRatePct, 66.67, 0.5)
  })

  test('counts production-discovered defects in escape rate numerator', async ({ assert }) => {
    await seedDefect({ ticketId: 'BUG-1', foundInStage: 'production' })
    await seedDefect({ ticketId: 'BUG-2', foundInStage: 'dev' })

    const service = new DefectEscapeRateService()
    const result = await service.compute()

    // 1 escaped (production) out of 2 = 50%
    assert.approximately(result.escapeRatePct, 50, 0.5)
  })

  test('excludes DEV-discovered defects from escape rate numerator', async ({ assert }) => {
    await seedDefect({ ticketId: 'BUG-1', foundInStage: 'dev' })
    await seedDefect({ ticketId: 'BUG-2', foundInStage: 'ba' })

    const service = new DefectEscapeRateService()
    const result = await service.compute()

    // 0 escaped out of 2 = 0%
    assert.equal(result.escapeRatePct, 0)
    assert.equal(result.count, 2)
  })
})

test.group('DefectEscapeRateService | attribution and reclassification', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('uses latest attribution per ticket when reclassified event exists', async ({ assert }) => {
    const ts = DateTime.now()
    // First logged as 'dev', then reclassified to 'production'
    await DefectEvent.create({
      source: 'jira',
      ticketId: 'BUG-1',
      eventType: 'logged',
      foundInStage: 'dev',
      eventTimestamp: ts.minus({ hours: 2 }),
    })
    await DefectEvent.create({
      source: 'jira',
      ticketId: 'BUG-1',
      eventType: 'reclassified',
      foundInStage: 'production',
      eventTimestamp: ts.minus({ hours: 1 }),
    })

    const service = new DefectEscapeRateService()
    const result = await service.compute()

    // Latest event for BUG-1 is 'production' (escaped)
    assert.equal(result.count, 1)
    assert.equal(result.escapeRatePct, 100)
  })

  test('reports unattributed percentage (defects with null introduced_in_stage)', async ({
    assert,
  }) => {
    await seedDefect({ ticketId: 'BUG-1', foundInStage: 'production', introducedInStage: null })
    await seedDefect({ ticketId: 'BUG-2', foundInStage: 'dev', introducedInStage: 'ba' })

    const service = new DefectEscapeRateService()
    const result = await service.compute()

    // 1 out of 2 defects has no introducedInStage
    assert.equal(result.unattributedCount, 1)
    assert.approximately(result.unattributedPct, 50, 0.5)
  })

  test('builds stage-pair matrix from attributed defects', async ({ assert }) => {
    await seedDefect({
      ticketId: 'BUG-1',
      foundInStage: 'uat',
      introducedInStage: 'dev',
    })
    await seedDefect({
      ticketId: 'BUG-2',
      foundInStage: 'uat',
      introducedInStage: 'dev',
    })
    await seedDefect({
      ticketId: 'BUG-3',
      foundInStage: 'production',
      introducedInStage: 'ba',
    })

    const service = new DefectEscapeRateService()
    const result = await service.compute()

    const devUat = result.stagePairMatrix.find(
      (r) => r.introducedIn === 'dev' && r.foundIn === 'uat'
    )
    const baProd = result.stagePairMatrix.find(
      (r) => r.introducedIn === 'ba' && r.foundIn === 'production'
    )

    assert.isNotNull(devUat)
    assert.equal(devUat!.count, 2)
    assert.isNotNull(baProd)
    assert.equal(baProd!.count, 1)
  })
})

test.group('DefectEscapeRateService | filtering', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('filters by delivery stream id', async ({ assert }) => {
    const ds = await seedDeliveryStream()
    const other = await seedDeliveryStream('other-ds')

    await seedDefect({ ticketId: 'BUG-1', foundInStage: 'production', deliveryStreamId: ds.id })
    await seedDefect({ ticketId: 'BUG-2', foundInStage: 'production', deliveryStreamId: other.id })
    await seedDefect({ ticketId: 'BUG-3', foundInStage: 'dev', deliveryStreamId: ds.id })

    const service = new DefectEscapeRateService(ds.id)
    const result = await service.compute()

    // Only BUG-1 and BUG-3 from ds; 1 escaped out of 2 = 50%
    assert.equal(result.count, 2)
    assert.approximately(result.escapeRatePct, 50, 0.5)
  })

  test('excludes defects outside the rolling window', async ({ assert }) => {
    // In window (within 30 days)
    await seedDefect({ ticketId: 'BUG-1', foundInStage: 'production', daysAgo: 15 })
    // Outside window (>30 days)
    await seedDefect({ ticketId: 'BUG-2', foundInStage: 'production', daysAgo: 45 })

    const service = new DefectEscapeRateService(undefined, 30)
    const result = await service.compute()

    assert.equal(result.count, 1)
  })
})
