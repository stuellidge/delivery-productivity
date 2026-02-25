import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import TechStream from '#models/tech_stream'
import Repository from '#models/repository'
import PrEvent from '#models/pr_event'
import GithubGapDetectionService from '#services/github_gap_detection_service'

let originalFetch: typeof globalThis.fetch
let originalSetTimeout: typeof globalThis.setTimeout

// Use relative dates so the 7-day lookback logic always works
const NOW = DateTime.utc()
const WITHIN_WINDOW = NOW.minus({ days: 3 }).toISO()!
const OUTSIDE_WINDOW = NOW.minus({ days: 30 }).toISO()!

function buildPr(
  number: number,
  opts: {
    title?: string
    created_at?: string
    closed_at?: string | null
    merged_at?: string | null
    updated_at?: string
  } = {}
) {
  const closedAt = opts.closed_at !== undefined ? opts.closed_at : WITHIN_WINDOW
  const mergedAt = opts.merged_at !== undefined ? opts.merged_at : WITHIN_WINDOW
  return {
    number,
    title: opts.title ?? `PR ${number}`,
    body: null,
    head: { ref: `feat/branch-${number}`, sha: 'abc' },
    base: { ref: 'main' },
    user: { login: `user${number}` },
    created_at: opts.created_at ?? WITHIN_WINDOW,
    closed_at: closedAt,
    merged_at: mergedAt,
    updated_at: opts.updated_at ?? WITHIN_WINDOW,
  }
}

async function seedTechStreamAndRepo(suffix: string) {
  const ts = await TechStream.create({
    name: `gap-ts-${suffix}`,
    displayName: `Gap TS ${suffix}`,
    githubOrg: `acme-gap-${suffix}`,
    githubInstallId: `99${suffix}`,
    isActive: true,
  })
  const repo = await Repository.create({
    techStreamId: ts.id,
    githubOrg: `acme-gap-${suffix}`,
    githubRepoName: 'api',
    fullName: `acme-gap-${suffix}/api`,
    defaultBranch: 'main',
    isDeployable: true,
    isActive: true,
  })
  return { ts, repo }
}

test.group('GithubGapDetectionService | run', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())
  group.each.setup(() => {
    originalFetch = globalThis.fetch
    originalSetTimeout = globalThis.setTimeout
    process.env.GITHUB_TOKEN = 'test-gap-token'
  })
  group.each.teardown(() => {
    globalThis.fetch = originalFetch
    globalThis.setTimeout = originalSetTimeout
    delete process.env.GITHUB_TOKEN
  })

  test('does nothing when GITHUB_TOKEN is not set', async ({ assert }) => {
    delete process.env.GITHUB_TOKEN

    let fetchCalled = false
    globalThis.fetch = async () => {
      fetchCalled = true
      return { ok: true, headers: { get: () => '9999' }, json: async () => [] } as any
    }

    const result = await new GithubGapDetectionService().run()

    assert.isFalse(fetchCalled)
    assert.equal(result.checked, 0)
    assert.equal(result.backfilled, 0)
  })

  test('does nothing when no active tech streams exist', async ({ assert }) => {
    let fetchCalled = false
    globalThis.fetch = async () => {
      fetchCalled = true
      return { ok: true, headers: { get: () => '9999' }, json: async () => [] } as any
    }

    const result = await new GithubGapDetectionService().run()

    assert.isFalse(fetchCalled)
    assert.equal(result.checked, 0)
  })

  test('does not backfill when merged PrEvent already exists in DB', async ({ assert }) => {
    const { repo } = await seedTechStreamAndRepo('001')

    const pr = buildPr(1)

    // Pre-seed the merged event
    await PrEvent.create({
      source: 'github',
      eventType: 'merged',
      prNumber: 1,
      repoId: repo.id,
      githubOrg: repo.githubOrg,
      githubRepo: 'api',
      techStreamId: repo.techStreamId,
      eventTimestamp: DateTime.fromISO(WITHIN_WINDOW),
    })

    globalThis.fetch = async () =>
      ({
        ok: true,
        headers: { get: () => '9999' },
        json: async () => [pr],
      }) as any

    const result = await new GithubGapDetectionService().run()

    assert.equal(result.checked, 1)
    assert.equal(result.backfilled, 0)

    // Still only one PrEvent (no duplicate)
    const events = await PrEvent.query()
      .where('repo_id', repo.id)
      .where('pr_number', 1)
      .where('event_type', 'merged')
    assert.equal(events.length, 1)
  })

  test('backfills missing merged PrEvent', async ({ assert }) => {
    const { repo } = await seedTechStreamAndRepo('002')

    const pr = buildPr(2)
    globalThis.fetch = async () =>
      ({
        ok: true,
        headers: { get: () => '9999' },
        json: async () => [pr],
      }) as any

    const result = await new GithubGapDetectionService().run()

    assert.equal(result.checked, 1)
    assert.equal(result.backfilled, 1)

    const event = await PrEvent.query()
      .where('repo_id', repo.id)
      .where('pr_number', 2)
      .where('event_type', 'merged')
      .first()
    assert.isNotNull(event)
  })

  test('backfills missing closed PrEvent (merged_at is null)', async ({ assert }) => {
    const { repo } = await seedTechStreamAndRepo('003')

    const pr = buildPr(3, { merged_at: null })
    globalThis.fetch = async () =>
      ({
        ok: true,
        headers: { get: () => '9999' },
        json: async () => [pr],
      }) as any

    const result = await new GithubGapDetectionService().run()

    assert.equal(result.checked, 1)
    assert.equal(result.backfilled, 1)

    const event = await PrEvent.query()
      .where('repo_id', repo.id)
      .where('pr_number', 3)
      .where('event_type', 'closed')
      .first()
    assert.isNotNull(event)
  })

  test('skips open PRs (no closed_at)', async ({ assert }) => {
    await seedTechStreamAndRepo('004')

    const pr = buildPr(4, { closed_at: null, merged_at: null })
    globalThis.fetch = async () =>
      ({
        ok: true,
        headers: { get: () => '9999' },
        json: async () => [pr],
      }) as any

    const result = await new GithubGapDetectionService().run()

    assert.equal(result.checked, 0)
    assert.equal(result.backfilled, 0)
  })

  test('stops processing when updated_at falls outside lookback window', async ({ assert }) => {
    const { repo } = await seedTechStreamAndRepo('005')

    // PR within window — will be checked
    const prInWindow = buildPr(5, { updated_at: WITHIN_WINDOW })

    // PR outside window — should trigger early break
    const prOutsideWindow = buildPr(6, {
      updated_at: OUTSIDE_WINDOW,
      closed_at: OUTSIDE_WINDOW,
      merged_at: OUTSIDE_WINDOW,
    })

    globalThis.fetch = async () =>
      ({
        ok: true,
        headers: { get: () => '9999' },
        json: async () => [prInWindow, prOutsideWindow],
      }) as any

    const result = await new GithubGapDetectionService().run()

    // Only the first PR (within window) was checked; second triggered early break
    assert.equal(result.checked, 1)

    // No pre-existing events → first one was backfilled
    assert.equal(result.backfilled, 1)

    // PR outside window should NOT have been backfilled
    const outsideEvent = await PrEvent.query()
      .where('repo_id', repo.id)
      .where('pr_number', 6)
      .first()
    assert.isNull(outsideEvent)
  })

  test('returns correct counts across multiple repos', async ({ assert }) => {
    // Two separate tech streams with different orgs
    const ts1 = await TechStream.create({
      name: 'gap-ts-multi-1',
      displayName: 'Gap TS Multi 1',
      githubOrg: 'acme-multi-1',
      githubInstallId: '990011',
      isActive: true,
    })
    const repo1 = await Repository.create({
      techStreamId: ts1.id,
      githubOrg: 'acme-multi-1',
      githubRepoName: 'api',
      fullName: 'acme-multi-1/api',
      defaultBranch: 'main',
      isDeployable: true,
      isActive: true,
    })

    const ts2 = await TechStream.create({
      name: 'gap-ts-multi-2',
      displayName: 'Gap TS Multi 2',
      githubOrg: 'acme-multi-2',
      githubInstallId: '990022',
      isActive: true,
    })
    await Repository.create({
      techStreamId: ts2.id,
      githubOrg: 'acme-multi-2',
      githubRepoName: 'frontend',
      fullName: 'acme-multi-2/frontend',
      defaultBranch: 'main',
      isDeployable: true,
      isActive: true,
    })

    // Pre-seed one existing merged event for repo1/PR 10
    await PrEvent.create({
      source: 'github',
      eventType: 'merged',
      prNumber: 10,
      repoId: repo1.id,
      githubOrg: 'acme-multi-1',
      githubRepo: 'api',
      techStreamId: ts1.id,
      eventTimestamp: DateTime.fromISO(WITHIN_WINDOW),
    })

    const pr10 = buildPr(10)
    const pr20 = buildPr(20)

    // First call: repo1 → [pr10], second call: repo2 → [pr20]
    let callCount = 0
    globalThis.fetch = async () => {
      const data = callCount === 0 ? [pr10] : callCount === 1 ? [pr20] : []
      callCount++
      return {
        ok: true,
        headers: { get: () => '9999' },
        json: async () => data,
      } as any
    }

    const result = await new GithubGapDetectionService().run()

    assert.equal(result.checked, 2)
    assert.equal(result.backfilled, 1) // only pr20 was missing
  })

  test('waits 60s when rate limit remaining < 200', async ({ assert }) => {
    await seedTechStreamAndRepo('006')

    let waitDurationMs = 0
    globalThis.setTimeout = ((fn: any, delay: number) => {
      waitDurationMs = delay
      fn()
      return 0 as any
    }) as any

    globalThis.fetch = async () =>
      ({
        ok: true,
        headers: { get: (h: string) => (h === 'X-RateLimit-Remaining' ? '150' : '9999') },
        json: async () => [],
      }) as any

    await new GithubGapDetectionService().run()

    assert.equal(waitDurationMs, 60_000)
  })
})
