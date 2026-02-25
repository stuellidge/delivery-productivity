import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import TechStream from '#models/tech_stream'
import Repository from '#models/repository'
import PrEvent from '#models/pr_event'
import GitHubBackfillService from '#services/github_backfill_service'

let originalFetch: typeof globalThis.fetch
let originalSetTimeout: typeof globalThis.setTimeout

function buildPr(
  number: number,
  opts: {
    head?: string
    title?: string
    created_at?: string
    closed_at?: string | null
    merged_at?: string | null
  } = {}
) {
  return {
    number,
    title: opts.title ?? `PR ${number}`,
    body: null,
    head: { ref: opts.head ?? `feat/branch-${number}`, sha: 'abc' },
    base: { ref: 'main' },
    user: { login: `user${number}` },
    created_at: opts.created_at ?? '2026-01-10T10:00:00Z',
    closed_at: opts.closed_at ?? null,
    merged_at: opts.merged_at ?? null,
  }
}

async function seedTechStreamAndRepo(suffix: string) {
  const ts = await TechStream.create({
    name: `backend-${suffix}`,
    displayName: 'Backend',
    githubOrg: 'acme',
    githubInstallId: `7${suffix}`,
    isActive: true,
  })
  const repo = await Repository.create({
    techStreamId: ts.id,
    githubOrg: 'acme',
    githubRepoName: 'api',
    fullName: 'acme/api',
    defaultBranch: 'main',
    isDeployable: true,
    isActive: true,
  })
  return { ts, repo }
}

test.group('GitHubBackfillService | run', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())
  group.each.setup(() => {
    originalFetch = globalThis.fetch
    originalSetTimeout = globalThis.setTimeout
    process.env.GITHUB_TOKEN = 'test-github-token'
  })
  group.each.teardown(() => {
    globalThis.fetch = originalFetch
    globalThis.setTimeout = originalSetTimeout
    delete process.env.GITHUB_TOKEN
  })

  test('creates opened PrEvent for each PR in the org', async ({ assert }) => {
    const { repo } = await seedTechStreamAndRepo('7001')
    const pr = buildPr(1, { head: 'feat/PAY-111-checkout' })

    globalThis.fetch = async () =>
      ({
        ok: true,
        headers: { get: () => '9999' },
        json: async () => [pr],
      }) as any

    await new GitHubBackfillService('acme').run()

    const event = await PrEvent.query()
      .where('repo_id', repo.id)
      .where('pr_number', 1)
      .where('event_type', 'opened')
      .first()

    assert.isNotNull(event)
    assert.equal(event!.source, 'github')
    assert.equal(event!.linkedTicketId, 'PAY-111')
  })

  test('creates merged PrEvent when PR has merged_at', async ({ assert }) => {
    const { repo } = await seedTechStreamAndRepo('7002')
    const pr = buildPr(2, {
      closed_at: '2026-01-15T12:00:00Z',
      merged_at: '2026-01-15T12:00:00Z',
    })

    globalThis.fetch = async () =>
      ({
        ok: true,
        headers: { get: () => '9999' },
        json: async () => [pr],
      }) as any

    await new GitHubBackfillService('acme').run()

    const merged = await PrEvent.query()
      .where('repo_id', repo.id)
      .where('pr_number', 2)
      .where('event_type', 'merged')
      .first()

    assert.isNotNull(merged)
  })

  test('creates closed PrEvent when PR is closed but not merged', async ({ assert }) => {
    const { repo } = await seedTechStreamAndRepo('7003')
    const pr = buildPr(3, { closed_at: '2026-01-14T10:00:00Z', merged_at: null })

    globalThis.fetch = async () =>
      ({
        ok: true,
        headers: { get: () => '9999' },
        json: async () => [pr],
      }) as any

    await new GitHubBackfillService('acme').run()

    const closed = await PrEvent.query()
      .where('repo_id', repo.id)
      .where('pr_number', 3)
      .where('event_type', 'closed')
      .first()

    assert.isNotNull(closed)
  })

  test('is idempotent — duplicate run does not create duplicate opened events', async ({
    assert,
  }) => {
    const { repo } = await seedTechStreamAndRepo('7004')
    const pr = buildPr(4)

    globalThis.fetch = async () =>
      ({
        ok: true,
        headers: { get: () => '9999' },
        json: async () => [pr],
      }) as any

    await new GitHubBackfillService('acme').run()
    await new GitHubBackfillService('acme').run()

    const rows = await PrEvent.query()
      .where('repo_id', repo.id)
      .where('pr_number', 4)
      .where('event_type', 'opened')

    assert.equal(rows.length, 1)
  })

  test('waits 60s when X-RateLimit-Remaining drops below 500 (spec §5.3.7)', async ({ assert }) => {
    await seedTechStreamAndRepo('7005')

    let waitDurationMs = 0
    globalThis.setTimeout = ((fn: any, delay: number) => {
      waitDurationMs = delay
      fn()
      return 0 as any
    }) as any

    globalThis.fetch = async () =>
      ({
        ok: true,
        headers: { get: () => '499' },
        json: async () => [],
      }) as any

    await new GitHubBackfillService('acme').run()

    assert.equal(waitDurationMs, 60_000)
  })

  test('does not wait when X-RateLimit-Remaining is exactly 500', async ({ assert }) => {
    await seedTechStreamAndRepo('7006')

    let waitCalled = false
    globalThis.setTimeout = ((fn: any, _delay: number) => {
      waitCalled = true
      fn()
      return 0 as any
    }) as any

    globalThis.fetch = async () =>
      ({
        ok: true,
        headers: { get: () => '500' },
        json: async () => [],
      }) as any

    await new GitHubBackfillService('acme').run()

    assert.isFalse(waitCalled)
  })

  test('does nothing when GITHUB_TOKEN is not configured', async ({ assert }) => {
    delete process.env.GITHUB_TOKEN

    let fetchCalled = false
    globalThis.fetch = async () => {
      fetchCalled = true
      return { ok: true, headers: { get: () => '9999' }, json: async () => [] } as any
    }

    await new GitHubBackfillService('acme').run()

    assert.isFalse(fetchCalled)
  })
})
