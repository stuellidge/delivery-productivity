import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import TechStream from '#models/tech_stream'
import Repository from '#models/repository'
import PrEvent from '#models/pr_event'
import PrCycle from '#models/pr_cycle'
import PrReviewTurnaroundService from '#services/pr_review_turnaround_service'

const NOW = DateTime.now()
const WITHIN_WINDOW = NOW.minus({ days: 10 })
const OUTSIDE_WINDOW = NOW.minus({ days: 60 })

async function seedTechStream() {
  return TechStream.create({
    name: 'frontend',
    displayName: 'Frontend',
    githubOrg: 'acme-frontend',
    githubInstallId: '55555',
    isActive: true,
  })
}

async function seedRepo(techStreamId: number) {
  return Repository.create({
    techStreamId,
    githubOrg: 'acme-frontend',
    githubRepoName: 'web-app',
    fullName: 'acme-frontend/web-app',
    defaultBranch: 'main',
    isDeployable: true,
    isActive: true,
  })
}

async function seedPrCycle(
  repoId: number,
  techStreamId: number,
  prNumber: number,
  timeToFirstReviewHrs: number | null,
  mergedAt: DateTime
) {
  return PrCycle.create({
    repoId,
    techStreamId,
    prNumber,
    openedAt: mergedAt.minus({ hours: 48 }),
    mergedAt,
    timeToFirstReviewHrs,
    firstReviewAt: timeToFirstReviewHrs ? mergedAt.minus({ hours: 5 }) : null,
  })
}

async function seedReviewEvent(
  repoId: number,
  techStreamId: number,
  prNumber: number,
  reviewerHash: string,
  eventTimestamp: DateTime
) {
  return PrEvent.create({
    source: 'github',
    eventType: 'review_submitted',
    prNumber,
    repoId,
    githubOrg: 'acme-frontend',
    githubRepo: 'web-app',
    techStreamId,
    reviewerHash,
    eventTimestamp,
  })
}

async function seedOpenedEvent(
  repoId: number,
  techStreamId: number,
  prNumber: number,
  linkedTicketId: string | null,
  eventTimestamp: DateTime
) {
  return PrEvent.create({
    source: 'github',
    eventType: 'opened',
    prNumber,
    repoId,
    githubOrg: 'acme-frontend',
    githubRepo: 'web-app',
    techStreamId,
    linkedTicketId,
    eventTimestamp,
  })
}

test.group('PrReviewTurnaroundService | percentiles', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns zero p50 and p85 when no data', async ({ assert }) => {
    const techStream = await seedTechStream()
    const service = new PrReviewTurnaroundService(techStream.id, 30)
    const result = await service.compute()

    assert.equal(result.p50, 0)
    assert.equal(result.p85, 0)
  })

  test('computes p50 correctly from multiple cycles', async ({ assert }) => {
    const techStream = await seedTechStream()
    const repo = await seedRepo(techStream.id)

    // Seed cycles with time_to_first_review_hrs: 4, 6, 8, 10, 12
    await seedPrCycle(repo.id, techStream.id, 1, 4, WITHIN_WINDOW)
    await seedPrCycle(repo.id, techStream.id, 2, 6, WITHIN_WINDOW)
    await seedPrCycle(repo.id, techStream.id, 3, 8, WITHIN_WINDOW)
    await seedPrCycle(repo.id, techStream.id, 4, 10, WITHIN_WINDOW)
    await seedPrCycle(repo.id, techStream.id, 5, 12, WITHIN_WINDOW)

    const service = new PrReviewTurnaroundService(techStream.id, 30)
    const result = await service.compute()

    // Median of [4,6,8,10,12] = 8
    assert.approximately(result.p50, 8, 0.5)
  })

  test('computes p85 correctly from multiple cycles', async ({ assert }) => {
    const techStream = await seedTechStream()
    const repo = await seedRepo(techStream.id)

    // 5 values: 4, 6, 8, 10, 12
    await seedPrCycle(repo.id, techStream.id, 1, 4, WITHIN_WINDOW)
    await seedPrCycle(repo.id, techStream.id, 2, 6, WITHIN_WINDOW)
    await seedPrCycle(repo.id, techStream.id, 3, 8, WITHIN_WINDOW)
    await seedPrCycle(repo.id, techStream.id, 4, 10, WITHIN_WINDOW)
    await seedPrCycle(repo.id, techStream.id, 5, 12, WITHIN_WINDOW)

    const service = new PrReviewTurnaroundService(techStream.id, 30)
    const result = await service.compute()

    // p85 of [4,6,8,10,12] ≈ 11.4
    assert.isAbove(result.p85, 10)
    assert.isBelow(result.p85, 12)
  })

  test('excludes cycles outside the time window', async ({ assert }) => {
    const techStream = await seedTechStream()
    const repo = await seedRepo(techStream.id)

    // Only the old cycle should be excluded
    await seedPrCycle(repo.id, techStream.id, 1, 100, OUTSIDE_WINDOW) // outside 30d window
    await seedPrCycle(repo.id, techStream.id, 2, 4, WITHIN_WINDOW)

    const service = new PrReviewTurnaroundService(techStream.id, 30)
    const result = await service.compute()

    // Only cycle 2 (4 hrs) should be included
    assert.approximately(result.p50, 4, 0.1)
  })
})

test.group('PrReviewTurnaroundService | reviewer concentration', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns empty concentration when no reviews', async ({ assert }) => {
    const techStream = await seedTechStream()
    const service = new PrReviewTurnaroundService(techStream.id, 30)
    const result = await service.compute()

    assert.deepEqual(result.reviewerConcentration, [])
  })

  test('computes reviewer concentration percentages', async ({ assert }) => {
    const techStream = await seedTechStream()
    const repo = await seedRepo(techStream.id)

    // Bob reviews 3, Carol reviews 1 → Bob = 75%, Carol = 25%
    await seedReviewEvent(repo.id, techStream.id, 1, 'hash_bob', WITHIN_WINDOW)
    await seedReviewEvent(repo.id, techStream.id, 2, 'hash_bob', WITHIN_WINDOW)
    await seedReviewEvent(repo.id, techStream.id, 3, 'hash_bob', WITHIN_WINDOW)
    await seedReviewEvent(repo.id, techStream.id, 4, 'hash_carol', WITHIN_WINDOW)

    // minContributors=1 disables the safeguard for this test
    const service = new PrReviewTurnaroundService(techStream.id, 30, 1)
    const result = await service.compute()

    assert.equal(result.reviewerConcentration.length, 2)

    const bob = result.reviewerConcentration.find((r) => r.reviewerHash === 'hash_bob')
    assert.isNotNull(bob)
    assert.approximately(bob!.percentage, 75, 0.1)
    assert.isTrue(bob!.isConcerning)

    const carol = result.reviewerConcentration.find((r) => r.reviewerHash === 'hash_carol')
    assert.isNotNull(carol)
    assert.approximately(carol!.percentage, 25, 0.1)
    assert.isFalse(carol!.isConcerning)
  })

  test('flags reviewer with > 50% concentration as concerning', async ({ assert }) => {
    const techStream = await seedTechStream()
    const repo = await seedRepo(techStream.id)

    // Dave reviews 4/5 = 80%
    await seedReviewEvent(repo.id, techStream.id, 1, 'hash_dave', WITHIN_WINDOW)
    await seedReviewEvent(repo.id, techStream.id, 2, 'hash_dave', WITHIN_WINDOW)
    await seedReviewEvent(repo.id, techStream.id, 3, 'hash_dave', WITHIN_WINDOW)
    await seedReviewEvent(repo.id, techStream.id, 4, 'hash_dave', WITHIN_WINDOW)
    await seedReviewEvent(repo.id, techStream.id, 5, 'hash_eve', WITHIN_WINDOW)

    // minContributors=1 disables the safeguard for this test
    const service = new PrReviewTurnaroundService(techStream.id, 30, 1)
    const result = await service.compute()

    const dave = result.reviewerConcentration.find((r) => r.reviewerHash === 'hash_dave')
    assert.isTrue(dave!.isConcerning)
  })
})

test.group('PrReviewTurnaroundService | small-team safeguard', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns empty reviewerConcentration and isSuppressed=true when distinct contributors < minContributors', async ({
    assert,
  }) => {
    const techStream = await seedTechStream()
    const repo = await seedRepo(techStream.id)

    // Only 2 distinct contributors (below default 6)
    await seedReviewEvent(repo.id, techStream.id, 1, 'hash_alice', WITHIN_WINDOW)
    await seedReviewEvent(repo.id, techStream.id, 2, 'hash_bob', WITHIN_WINDOW)
    await seedOpenedEvent(repo.id, techStream.id, 1, null, WITHIN_WINDOW)
    await seedOpenedEvent(repo.id, techStream.id, 2, null, WITHIN_WINDOW)

    const service = new PrReviewTurnaroundService(techStream.id, 30, 6)
    const result = await service.compute()

    assert.isTrue(result.isSuppressed)
    assert.deepEqual(result.reviewerConcentration, [])
  })

  test('returns full reviewerConcentration and isSuppressed=false when contributors >= minContributors', async ({
    assert,
  }) => {
    const techStream = await seedTechStream()
    const repo = await seedRepo(techStream.id)

    // 6 distinct contributors (meets threshold)
    for (let i = 0; i < 6; i++) {
      await seedOpenedEvent(repo.id, techStream.id, i + 1, null, WITHIN_WINDOW)
      await seedReviewEvent(repo.id, techStream.id, i + 1, `hash_user${i}`, WITHIN_WINDOW)
    }

    const service = new PrReviewTurnaroundService(techStream.id, 30, 6)
    const result = await service.compute()

    assert.isFalse(result.isSuppressed)
    assert.isAbove(result.reviewerConcentration.length, 0)
  })

  test('uses minContributors=6 by default', async ({ assert }) => {
    const techStream = await seedTechStream()
    const repo = await seedRepo(techStream.id)

    // 5 distinct contributors (below default 6)
    for (let i = 0; i < 5; i++) {
      await seedOpenedEvent(repo.id, techStream.id, i + 1, null, WITHIN_WINDOW)
      await seedReviewEvent(repo.id, techStream.id, i + 1, `hash_def${i}`, WITHIN_WINDOW)
    }

    // No minContributors arg — uses default of 6
    const service = new PrReviewTurnaroundService(techStream.id, 30)
    const result = await service.compute()

    assert.isTrue(result.isSuppressed)
  })

  test('respects custom minContributors passed via constructor', async ({ assert }) => {
    const techStream = await seedTechStream()
    const repo = await seedRepo(techStream.id)

    // 3 distinct contributors — below 6 but above custom threshold of 2
    for (let i = 0; i < 3; i++) {
      await seedOpenedEvent(repo.id, techStream.id, i + 1, null, WITHIN_WINDOW)
      await seedReviewEvent(repo.id, techStream.id, i + 1, `hash_cust${i}`, WITHIN_WINDOW)
    }

    const service = new PrReviewTurnaroundService(techStream.id, 30, 2)
    const result = await service.compute()

    assert.isFalse(result.isSuppressed)
    assert.isAbove(result.reviewerConcentration.length, 0)
  })
})

test.group('PrReviewTurnaroundService | PR to ticket linkage', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('computes 100% linkage rate when all PRs have ticket ids', async ({ assert }) => {
    const techStream = await seedTechStream()
    const repo = await seedRepo(techStream.id)

    await seedOpenedEvent(repo.id, techStream.id, 1, 'PAY-100', WITHIN_WINDOW)
    await seedOpenedEvent(repo.id, techStream.id, 2, 'PAY-101', WITHIN_WINDOW)

    const service = new PrReviewTurnaroundService(techStream.id, 30)
    const result = await service.compute()

    assert.approximately(result.prToTicketLinkageRate, 100, 0.1)
  })

  test('computes 50% linkage rate when half PRs have ticket ids', async ({ assert }) => {
    const techStream = await seedTechStream()
    const repo = await seedRepo(techStream.id)

    await seedOpenedEvent(repo.id, techStream.id, 1, 'PAY-100', WITHIN_WINDOW)
    await seedOpenedEvent(repo.id, techStream.id, 2, null, WITHIN_WINDOW)

    const service = new PrReviewTurnaroundService(techStream.id, 30)
    const result = await service.compute()

    assert.approximately(result.prToTicketLinkageRate, 50, 0.1)
  })

  test('returns 0% linkage rate when no PRs opened in window', async ({ assert }) => {
    const techStream = await seedTechStream()

    const service = new PrReviewTurnaroundService(techStream.id, 30)
    const result = await service.compute()

    assert.equal(result.prToTicketLinkageRate, 0)
  })
})
