import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { createHash } from 'node:crypto'
import { DateTime } from 'luxon'
import ApiKey from '#models/api_key'
import TechStream from '#models/tech_stream'
import Repository from '#models/repository'
import PrEvent from '#models/pr_event'
import PrCycle from '#models/pr_cycle'

const RAW_KEY = 'test-pr-link-api-key'
const KEY_HASH = createHash('sha256').update(RAW_KEY).digest('hex')

async function seedApiKey() {
  return ApiKey.create({
    keyHash: KEY_HASH,
    displayName: 'Test PR Link Key',
    permissions: [],
    isActive: true,
  })
}

async function seedTechStream() {
  return TechStream.create({
    name: 'pr-link-ts',
    displayName: 'PR Link TS',
    githubOrg: 'acme-prl',
    githubInstallId: '55555',
    isActive: true,
  })
}

async function seedRepository(techStreamId: number) {
  return Repository.create({
    techStreamId,
    githubOrg: 'acme-prl',
    githubRepoName: 'service-x',
    fullName: 'acme-prl/service-x',
    defaultBranch: 'main',
    isActive: true,
  })
}

async function seedPrEvent(repoId: number, techStreamId: number, prNumber: number) {
  return PrEvent.create({
    source: 'github',
    eventType: 'merged',
    prNumber,
    repoId,
    githubOrg: 'acme-prl',
    githubRepo: 'service-x',
    techStreamId,
    eventTimestamp: DateTime.now(),
  })
}

test.group('API | POST /api/v1/pr-events/:id/link-ticket', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns 401 without API key', async ({ client }) => {
    const response = await client.post('/api/v1/pr-events/999/link-ticket')
    response.assertStatus(401)
  })

  test('returns 404 when pr_event_id does not exist', async ({ client, assert }) => {
    await seedApiKey()

    const response = await client
      .post('/api/v1/pr-events/99999/link-ticket')
      .header('Authorization', `Bearer ${RAW_KEY}`)
      .json({ ticket_id: 'PAY-123' })

    response.assertStatus(404)
    const body = response.body()
    assert.equal(body.status, 'error')
  })

  test('returns 422 when ticket_id is missing', async ({ client, assert }) => {
    await seedApiKey()
    const ts = await seedTechStream()
    const repo = await seedRepository(ts.id)
    const prEvent = await seedPrEvent(repo.id, ts.id, 101)

    const response = await client
      .post(`/api/v1/pr-events/${prEvent.id}/link-ticket`)
      .header('Authorization', `Bearer ${RAW_KEY}`)
      .json({})

    response.assertStatus(422)
    const body = response.body()
    assert.equal(body.status, 'error')
  })

  test('links PR to ticket when valid pr_event_id and ticket_id provided', async ({
    client,
    assert,
  }) => {
    await seedApiKey()
    const ts = await seedTechStream()
    const repo = await seedRepository(ts.id)
    const prEvent = await seedPrEvent(repo.id, ts.id, 201)

    const response = await client
      .post(`/api/v1/pr-events/${prEvent.id}/link-ticket`)
      .header('Authorization', `Bearer ${RAW_KEY}`)
      .json({ ticket_id: 'PAY-456' })

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.status, 'ok')
    assert.equal(body.data.linkedTicketId, 'PAY-456')

    // Verify DB updated
    const updated = await PrEvent.find(prEvent.id)
    assert.equal(updated!.linkedTicketId, 'PAY-456')
  })

  test('also updates pr_cycle linked_ticket_id when cycle exists', async ({ client, assert }) => {
    await seedApiKey()
    const ts = await seedTechStream()
    const repo = await seedRepository(ts.id)
    const prEvent = await seedPrEvent(repo.id, ts.id, 301)

    // Seed a matching pr_cycle
    await PrCycle.create({
      repoId: repo.id,
      techStreamId: ts.id,
      prNumber: 301,
      openedAt: DateTime.now().minus({ hours: 2 }),
    })

    const response = await client
      .post(`/api/v1/pr-events/${prEvent.id}/link-ticket`)
      .header('Authorization', `Bearer ${RAW_KEY}`)
      .json({ ticket_id: 'PAY-789' })

    response.assertStatus(200)

    const cycle = await PrCycle.query().where('repo_id', repo.id).where('pr_number', 301).first()
    assert.equal(cycle!.linkedTicketId, 'PAY-789')
  })
})
