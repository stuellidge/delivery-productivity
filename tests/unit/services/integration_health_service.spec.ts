import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import WorkItemEvent from '#models/work_item_event'
import PrEvent from '#models/pr_event'
import TechStream from '#models/tech_stream'
import Repository from '#models/repository'
import IntegrationHealthService from '#services/integration_health_service'

async function seedTechStream(name = 'health-ts') {
  return TechStream.create({
    name,
    displayName: name,
    githubOrg: 'acme',
    githubInstallId: '999',
    isActive: true,
  })
}

async function seedRepo(techStreamId: number) {
  return Repository.create({
    techStreamId,
    githubOrg: 'acme',
    githubRepoName: `repo-${Date.now()}`,
    fullName: `acme/repo-${Date.now()}`,
    isActive: true,
  })
}

test.group('IntegrationHealthService | jira source', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('reports healthy when recent jira events exist', async ({ assert }) => {
    await WorkItemEvent.create({
      source: 'jira',
      eventType: 'created',
      ticketId: 'TICK-1',
      deliveryStreamId: null,
      receivedAt: DateTime.now(),
      eventTimestamp: DateTime.now(),
    })
    const service = new IntegrationHealthService()
    const health = await service.getHealth()
    const jira = health.webhookSources.find((s) => s.source === 'jira')
    assert.exists(jira)
    assert.equal(jira!.status, 'healthy')
  })

  test('flags stale jira integration when no events in last 2 hours', async ({ assert }) => {
    await WorkItemEvent.create({
      source: 'jira',
      eventType: 'created',
      ticketId: 'TICK-OLD',
      deliveryStreamId: null,
      receivedAt: DateTime.now().minus({ hours: 3 }),
      eventTimestamp: DateTime.now().minus({ hours: 3 }),
    })
    const service = new IntegrationHealthService()
    const health = await service.getHealth()
    const jira = health.webhookSources.find((s) => s.source === 'jira')
    assert.exists(jira)
    assert.equal(jira!.status, 'stale')
  })

  test('reports no_data when no jira events exist', async ({ assert }) => {
    const service = new IntegrationHealthService()
    const health = await service.getHealth()
    const jira = health.webhookSources.find((s) => s.source === 'jira')
    assert.exists(jira)
    assert.equal(jira!.status, 'no_data')
  })
})

test.group('IntegrationHealthService | github source', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('flags stale github integration when no events in last 2 hours', async ({ assert }) => {
    const ts = await seedTechStream()
    const repo = await seedRepo(ts.id)
    await PrEvent.create({
      source: 'github',
      eventType: 'opened',
      prNumber: 1,
      repoId: repo.id,
      githubOrg: 'acme',
      githubRepo: 'repo',
      techStreamId: ts.id,
      linkedTicketId: null,
      eventTimestamp: DateTime.now().minus({ hours: 4 }),
    })
    const service = new IntegrationHealthService()
    const health = await service.getHealth()
    const github = health.webhookSources.find((s) => s.source === 'github')
    assert.exists(github)
    assert.equal(github!.status, 'stale')
  })

  test('reports healthy when recent github events exist', async ({ assert }) => {
    const ts = await seedTechStream('health-ts-gh')
    const repo = await seedRepo(ts.id)
    await PrEvent.create({
      source: 'github',
      eventType: 'opened',
      prNumber: 2,
      repoId: repo.id,
      githubOrg: 'acme',
      githubRepo: 'repo',
      techStreamId: ts.id,
      linkedTicketId: null,
      eventTimestamp: DateTime.now().minus({ minutes: 30 }),
    })
    const service = new IntegrationHealthService()
    const health = await service.getHealth()
    const github = health.webhookSources.find((s) => s.source === 'github')
    assert.equal(github!.status, 'healthy')
  })
})

test.group('IntegrationHealthService | event counts', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns event counts per source for last hour', async ({ assert }) => {
    await WorkItemEvent.create({
      source: 'jira',
      eventType: 'created',
      ticketId: 'TICK-2',
      deliveryStreamId: null,
      receivedAt: DateTime.now().minus({ minutes: 30 }),
      eventTimestamp: DateTime.now().minus({ minutes: 30 }),
    })
    await WorkItemEvent.create({
      source: 'jira',
      eventType: 'transitioned',
      ticketId: 'TICK-3',
      deliveryStreamId: null,
      receivedAt: DateTime.now().minus({ hours: 2 }),
      eventTimestamp: DateTime.now().minus({ hours: 2 }),
    })
    const service = new IntegrationHealthService()
    const health = await service.getHealth()
    const jira = health.webhookSources.find((s) => s.source === 'jira')
    // Only 1 event within last hour
    assert.equal(jira!.eventCountLastHour, 1)
  })

  test('result includes computedAt timestamp', async ({ assert }) => {
    const service = new IntegrationHealthService()
    const health = await service.getHealth()
    assert.isString(health.computedAt)
  })
})
