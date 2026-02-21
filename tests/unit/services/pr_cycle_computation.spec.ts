import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import TechStream from '#models/tech_stream'
import Repository from '#models/repository'
import PrEvent from '#models/pr_event'
import PrCycle from '#models/pr_cycle'
import PrCycleComputationService from '#services/pr_cycle_computation_service'

// Fixed timestamps
const T0 = DateTime.fromISO('2026-02-01T09:00:00.000Z') // PR opened
const T1 = DateTime.fromISO('2026-02-02T10:00:00.000Z') // First review (25h later)
const T2 = DateTime.fromISO('2026-02-03T09:00:00.000Z') // Approved
const T3 = DateTime.fromISO('2026-02-04T12:00:00.000Z') // Merged

async function seedTechStreamAndRepo() {
  const techStream = await TechStream.create({
    name: 'platform',
    displayName: 'Platform',
    githubOrg: 'acme',
    githubInstallId: '12345',
    isActive: true,
  })

  const repo = await Repository.create({
    techStreamId: techStream.id,
    githubOrg: 'acme',
    githubRepoName: 'api',
    fullName: 'acme/api',
    defaultBranch: 'main',
    isDeployable: true,
    isActive: true,
  })

  return { techStream, repo }
}

async function createPrEvent(
  repoId: number,
  techStreamId: number,
  prNumber: number,
  eventType: string,
  eventTimestamp: DateTime,
  extras: Record<string, any> = {}
) {
  return PrEvent.create({
    source: 'github',
    eventType: eventType as any,
    prNumber,
    repoId,
    githubOrg: 'acme',
    githubRepo: 'api',
    techStreamId,
    eventTimestamp,
    ...extras,
  })
}

test.group('PrCycleComputationService', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns null when no opened event exists', async ({ assert }) => {
    const { repo, techStream } = await seedTechStreamAndRepo()

    // Only a review event, no opened event
    await createPrEvent(repo.id, techStream.id, 200, 'review_submitted', T1, {
      reviewerHash: 'abc123',
    })

    const service = new PrCycleComputationService(repo.id, 200, techStream.id)
    const result = await service.compute()

    assert.isNull(result)
  })

  test('creates pr_cycle with opened_at from opened event', async ({ assert }) => {
    const { repo, techStream } = await seedTechStreamAndRepo()

    await createPrEvent(repo.id, techStream.id, 201, 'opened', T0)
    await createPrEvent(repo.id, techStream.id, 201, 'merged', T3)

    const service = new PrCycleComputationService(repo.id, 201, techStream.id)
    const result = await service.compute()

    assert.isNotNull(result)
    assert.equal(result!.openedAt.toISO()!.substring(0, 19), T0.toISO()!.substring(0, 19))
  })

  test('computes time_to_first_review_hrs correctly', async ({ assert }) => {
    const { repo, techStream } = await seedTechStreamAndRepo()

    await createPrEvent(repo.id, techStream.id, 202, 'opened', T0)
    await createPrEvent(repo.id, techStream.id, 202, 'review_submitted', T1, {
      reviewerHash: 'bob_hash',
    })
    await createPrEvent(repo.id, techStream.id, 202, 'merged', T3)

    const service = new PrCycleComputationService(repo.id, 202, techStream.id)
    const result = await service.compute()

    // T0 → T1 = 25 hours
    assert.isNotNull(result!.timeToFirstReviewHrs)
    assert.approximately(Number(result!.timeToFirstReviewHrs), 25, 0.1)
  })

  test('computes time_to_merge_hrs correctly', async ({ assert }) => {
    const { repo, techStream } = await seedTechStreamAndRepo()

    await createPrEvent(repo.id, techStream.id, 203, 'opened', T0)
    await createPrEvent(repo.id, techStream.id, 203, 'merged', T3)

    const service = new PrCycleComputationService(repo.id, 203, techStream.id)
    const result = await service.compute()

    // T0 → T3 = 75 hours
    assert.isNotNull(result!.timeToMergeHrs)
    assert.approximately(Number(result!.timeToMergeHrs), 75, 0.1)
  })

  test('sets time_to_first_review_hrs to null when no review events', async ({ assert }) => {
    const { repo, techStream } = await seedTechStreamAndRepo()

    await createPrEvent(repo.id, techStream.id, 204, 'opened', T0)
    await createPrEvent(repo.id, techStream.id, 204, 'merged', T3)

    const service = new PrCycleComputationService(repo.id, 204, techStream.id)
    const result = await service.compute()

    assert.isNull(result!.timeToFirstReviewHrs)
  })

  test('counts review rounds from review_submitted events', async ({ assert }) => {
    const { repo, techStream } = await seedTechStreamAndRepo()

    await createPrEvent(repo.id, techStream.id, 205, 'opened', T0)
    await createPrEvent(repo.id, techStream.id, 205, 'review_submitted', T1, {
      reviewerHash: 'bob_hash',
    })
    await createPrEvent(repo.id, techStream.id, 205, 'changes_requested', T1, {
      reviewerHash: 'bob_hash',
    })
    await createPrEvent(repo.id, techStream.id, 205, 'review_submitted', T2, {
      reviewerHash: 'bob_hash',
    })
    await createPrEvent(repo.id, techStream.id, 205, 'approved', T2, {
      reviewerHash: 'bob_hash',
    })
    await createPrEvent(repo.id, techStream.id, 205, 'merged', T3)

    const service = new PrCycleComputationService(repo.id, 205, techStream.id)
    const result = await service.compute()

    assert.equal(result!.reviewRounds, 2)
  })

  test('collects unique reviewer hashes', async ({ assert }) => {
    const { repo, techStream } = await seedTechStreamAndRepo()

    await createPrEvent(repo.id, techStream.id, 206, 'opened', T0)
    await createPrEvent(repo.id, techStream.id, 206, 'review_submitted', T1, {
      reviewerHash: 'hash_bob',
    })
    await createPrEvent(repo.id, techStream.id, 206, 'approved', T2, {
      reviewerHash: 'hash_carol',
    })
    await createPrEvent(repo.id, techStream.id, 206, 'merged', T3)

    const service = new PrCycleComputationService(repo.id, 206, techStream.id)
    const result = await service.compute()

    assert.isNotNull(result!.reviewerHashes)
    assert.equal(result!.reviewerCount, 2)
    assert.include(result!.reviewerHashes!, 'hash_bob')
    assert.include(result!.reviewerHashes!, 'hash_carol')
  })

  test('uses linked_ticket_id from latest event', async ({ assert }) => {
    const { repo, techStream } = await seedTechStreamAndRepo()

    await createPrEvent(repo.id, techStream.id, 207, 'opened', T0, {
      linkedTicketId: 'PAY-123',
    })
    await createPrEvent(repo.id, techStream.id, 207, 'merged', T3, {
      linkedTicketId: 'PAY-123',
    })

    const service = new PrCycleComputationService(repo.id, 207, techStream.id)
    const result = await service.compute()

    assert.equal(result!.linkedTicketId, 'PAY-123')
  })

  test('upserts existing pr_cycle record', async ({ assert }) => {
    const { repo, techStream } = await seedTechStreamAndRepo()

    await createPrEvent(repo.id, techStream.id, 208, 'opened', T0)
    await createPrEvent(repo.id, techStream.id, 208, 'merged', T3)

    const service = new PrCycleComputationService(repo.id, 208, techStream.id)
    await service.compute()
    await service.compute() // Second call should update, not create

    const count = await PrCycle.query()
      .where('repo_id', repo.id)
      .where('pr_number', 208)
      .count('* as total')

    assert.equal(Number(count[0].$extras.total), 1)
  })

  test('sets merged_at from merged event', async ({ assert }) => {
    const { repo, techStream } = await seedTechStreamAndRepo()

    await createPrEvent(repo.id, techStream.id, 209, 'opened', T0)
    await createPrEvent(repo.id, techStream.id, 209, 'merged', T3)

    const service = new PrCycleComputationService(repo.id, 209, techStream.id)
    const result = await service.compute()

    assert.isNotNull(result!.mergedAt)
    assert.equal(result!.mergedAt!.toISO()!.substring(0, 19), T3.toISO()!.substring(0, 19))
  })

  test('computes cycle with no merge event — mergedAt and timeToMergeHrs are null', async ({
    assert,
  }) => {
    const { repo, techStream } = await seedTechStreamAndRepo()

    // opened + review only, no merge → covers null branches for mergedAt / timeToMergeHrs
    // and uses openedEvent as the referenceEvent fallback
    await createPrEvent(repo.id, techStream.id, 211, 'opened', T0, { linesAdded: 10, linesRemoved: 2 })
    await createPrEvent(repo.id, techStream.id, 211, 'review_submitted', T1, {
      reviewerHash: 'hash_bob',
    })

    const service = new PrCycleComputationService(repo.id, 211, techStream.id)
    const result = await service.compute()

    assert.isNotNull(result)
    assert.isNull(result!.mergedAt)
    assert.isNull(result!.timeToMergeHrs)
    assert.isNotNull(result!.timeToFirstReviewHrs) // T0→T1 = 25h
  })

  test('approved_at is set from approved event', async ({ assert }) => {
    const { repo, techStream } = await seedTechStreamAndRepo()

    await createPrEvent(repo.id, techStream.id, 210, 'opened', T0)
    await createPrEvent(repo.id, techStream.id, 210, 'approved', T2, {
      reviewerHash: 'hash_bob',
    })
    await createPrEvent(repo.id, techStream.id, 210, 'merged', T3)

    const service = new PrCycleComputationService(repo.id, 210, techStream.id)
    const result = await service.compute()

    assert.isNotNull(result!.approvedAt)
  })
})
