import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import TechStream from '#models/tech_stream'
import Repository from '#models/repository'
import DeliveryStream from '#models/delivery_stream'
import WorkItemEvent from '#models/work_item_event'
import PrEvent from '#models/pr_event'
import PrCycle from '#models/pr_cycle'
import PrDeliveryStreamEnrichmentService from '#services/pr_delivery_stream_enrichment_service'

const NOW = DateTime.utc()

async function seedFixtures(suffix: string) {
  const ts = await TechStream.create({
    name: `enrich-ts-${suffix}`,
    displayName: `Enrich TS ${suffix}`,
    githubOrg: `acme-enrich-${suffix}`,
    githubInstallId: `77${suffix}`,
    isActive: true,
  })
  const repo = await Repository.create({
    techStreamId: ts.id,
    githubOrg: `acme-enrich-${suffix}`,
    githubRepoName: 'api',
    fullName: `acme-enrich-${suffix}/api`,
    defaultBranch: 'main',
    isDeployable: true,
    isActive: true,
  })
  const ds = await DeliveryStream.create({
    name: `enrich-ds-${suffix}`,
    displayName: `Enrich DS ${suffix}`,
    isActive: true,
  })
  return { ts, repo, ds }
}

async function seedPrEvent(
  repo: Repository,
  ts: TechStream,
  prNumber: number,
  linkedTicketId: string | null,
  deliveryStreamId: number | null = null
) {
  return PrEvent.create({
    source: 'github',
    eventType: 'opened',
    prNumber,
    repoId: repo.id,
    githubOrg: repo.githubOrg,
    githubRepo: 'api',
    techStreamId: ts.id,
    linkedTicketId,
    deliveryStreamId,
    eventTimestamp: NOW,
  })
}

async function seedPrCycle(
  repo: Repository,
  ts: TechStream,
  prNumber: number,
  linkedTicketId: string | null,
  deliveryStreamId: number | null = null
) {
  return PrCycle.create({
    repoId: repo.id,
    techStreamId: ts.id,
    prNumber,
    linkedTicketId,
    deliveryStreamId,
    openedAt: NOW,
  })
}

test.group('PrDeliveryStreamEnrichmentService | enrichByTicketId', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('sets deliveryStreamId on PrEvent from WorkItemEvent', async ({ assert }) => {
    const { ts, repo, ds } = await seedFixtures('001')

    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-100',
      eventType: 'created',
      deliveryStreamId: ds.id,
      eventTimestamp: NOW,
    })

    const pr = await seedPrEvent(repo, ts, 100, 'PAY-100')
    assert.isNull(pr.deliveryStreamId)

    const count = await new PrDeliveryStreamEnrichmentService().enrichByTicketId('PAY-100')

    assert.equal(count, 1)
    await pr.refresh()
    assert.equal(pr.deliveryStreamId, ds.id)
  })

  test('sets deliveryStreamId on PrCycle from WorkItemEvent', async ({ assert }) => {
    const { ts, repo, ds } = await seedFixtures('002')

    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-200',
      eventType: 'created',
      deliveryStreamId: ds.id,
      eventTimestamp: NOW,
    })

    await seedPrEvent(repo, ts, 200, 'PAY-200')
    const cycle = await seedPrCycle(repo, ts, 200, 'PAY-200')
    assert.isNull(cycle.deliveryStreamId)

    await new PrDeliveryStreamEnrichmentService().enrichByTicketId('PAY-200')

    await cycle.refresh()
    assert.equal(cycle.deliveryStreamId, ds.id)
  })

  test('returns 0 when no WorkItemEvent with deliveryStreamId exists for ticket', async ({
    assert,
  }) => {
    const { ts, repo } = await seedFixtures('003')

    // WorkItemEvent exists but deliveryStreamId is null
    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-300',
      eventType: 'created',
      deliveryStreamId: null,
      eventTimestamp: NOW,
    })

    await seedPrEvent(repo, ts, 300, 'PAY-300')

    const count = await new PrDeliveryStreamEnrichmentService().enrichByTicketId('PAY-300')

    assert.equal(count, 0)
  })

  test('returns 0 when no WorkItemEvent exists for ticket', async ({ assert }) => {
    const { ts, repo } = await seedFixtures('004')

    await seedPrEvent(repo, ts, 400, 'PAY-400')

    const count = await new PrDeliveryStreamEnrichmentService().enrichByTicketId('PAY-400')

    assert.equal(count, 0)
  })

  test('does not overwrite non-null deliveryStreamId on PrEvent', async ({ assert }) => {
    const { ts, repo, ds } = await seedFixtures('005')

    const otherDs = await DeliveryStream.create({
      name: 'enrich-other-ds',
      displayName: 'Enrich Other DS',
      isActive: true,
    })

    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-500',
      eventType: 'created',
      deliveryStreamId: ds.id,
      eventTimestamp: NOW,
    })

    // PrEvent already has a deliveryStreamId set
    const pr = await seedPrEvent(repo, ts, 500, 'PAY-500', otherDs.id)

    const count = await new PrDeliveryStreamEnrichmentService().enrichByTicketId('PAY-500')

    // No rows updated (already has a value)
    assert.equal(count, 0)
    await pr.refresh()
    // Should not be overwritten
    assert.equal(pr.deliveryStreamId, otherDs.id)
  })
})

test.group('PrDeliveryStreamEnrichmentService | enrichAllPending', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('enriches all pending PrEvents and returns count', async ({ assert }) => {
    const { ts, repo, ds } = await seedFixtures('006')

    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-600',
      eventType: 'created',
      deliveryStreamId: ds.id,
      eventTimestamp: NOW,
    })

    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-601',
      eventType: 'created',
      deliveryStreamId: ds.id,
      eventTimestamp: NOW,
    })

    const pr1 = await seedPrEvent(repo, ts, 600, 'PAY-600')
    const pr2 = await seedPrEvent(repo, ts, 601, 'PAY-601')

    const count = await new PrDeliveryStreamEnrichmentService().enrichAllPending()

    assert.equal(count, 2)
    await pr1.refresh()
    await pr2.refresh()
    assert.equal(pr1.deliveryStreamId, ds.id)
    assert.equal(pr2.deliveryStreamId, ds.id)
  })

  test('returns 0 when no pending PrEvents exist', async ({ assert }) => {
    const count = await new PrDeliveryStreamEnrichmentService().enrichAllPending()
    assert.equal(count, 0)
  })

  test('skips PrEvents with null linkedTicketId', async ({ assert }) => {
    const { ts, repo } = await seedFixtures('007')

    // PrEvent with no linked ticket — cannot be enriched
    await seedPrEvent(repo, ts, 700, null)

    const count = await new PrDeliveryStreamEnrichmentService().enrichAllPending()

    assert.equal(count, 0)
  })
})
