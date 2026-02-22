import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import TechStream from '#models/tech_stream'
import Repository from '#models/repository'
import PrEvent from '#models/pr_event'
import GithubEventNormalizerService from '#services/github_event_normalizer_service'

// Fixed timestamps for deterministic tests
const PR_OPENED_AT = '2026-02-01T09:00:00Z'
const PR_REVIEW_AT = '2026-02-02T10:00:00Z'

async function seedTechStreamAndRepo() {
  const techStream = await TechStream.create({
    name: 'platform',
    displayName: 'Platform',
    githubOrg: 'acme-platform',
    githubInstallId: '12345',
    isActive: true,
  })

  const repo = await Repository.create({
    techStreamId: techStream.id,
    githubOrg: 'acme-platform',
    githubRepoName: 'api-service',
    fullName: 'acme-platform/api-service',
    defaultBranch: 'main',
    isDeployable: true,
    isActive: true,
  })

  return { techStream, repo }
}

function buildPullRequestPayload(overrides: Record<string, any> = {}) {
  return {
    action: 'opened',
    installation: { id: 12345 },
    pull_request: {
      number: 101,
      title: 'Add payment gateway integration',
      body: 'Implements PAY-789 — payment gateway',
      user: { login: 'alice' },
      head: { ref: 'feat/PAY-789-payment-gateway' },
      base: { ref: 'main' },
      additions: 120,
      deletions: 30,
      changed_files: 5,
      created_at: PR_OPENED_AT,
      updated_at: PR_OPENED_AT,
      merged: false,
    },
    repository: {
      full_name: 'acme-platform/api-service',
      name: 'api-service',
      owner: { login: 'acme-platform' },
    },
    ...overrides,
  }
}

function buildPrReviewPayload(overrides: Record<string, any> = {}) {
  return {
    action: 'submitted',
    installation: { id: 12345 },
    review: {
      state: 'commented',
      user: { login: 'bob' },
      submitted_at: PR_REVIEW_AT,
    },
    pull_request: {
      number: 101,
      title: 'Add payment gateway integration',
      body: null,
      user: { login: 'alice' },
      head: { ref: 'feat/PAY-789-payment-gateway' },
      base: { ref: 'main' },
    },
    repository: {
      full_name: 'acme-platform/api-service',
      name: 'api-service',
      owner: { login: 'acme-platform' },
    },
    ...overrides,
  }
}

test.group('Github event normalizer | pull_request opened', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('creates a pr_event for pull_request opened', async ({ assert }) => {
    const { repo } = await seedTechStreamAndRepo()

    const service = new GithubEventNormalizerService(
      buildPullRequestPayload(),
      'pull_request',
      undefined
    )
    await service.process()

    const event = await PrEvent.query()
      .where('repo_id', repo.id)
      .where('pr_number', 101)
      .where('event_type', 'opened')
      .first()

    assert.isNotNull(event)
    assert.equal(event!.source, 'github')
    assert.equal(event!.githubOrg, 'acme-platform')
    assert.equal(event!.githubRepo, 'api-service')
    assert.equal(event!.branchName, 'feat/PAY-789-payment-gateway')
    assert.equal(event!.baseBranch, 'main')
    assert.equal(event!.linesAdded, 120)
    assert.equal(event!.linesRemoved, 30)
    assert.equal(event!.filesChanged, 5)
  })

  test('extracts linked_ticket_id from branch name', async ({ assert }) => {
    await seedTechStreamAndRepo()

    const service = new GithubEventNormalizerService(
      buildPullRequestPayload({
        pull_request: {
          number: 101,
          title: 'Some unrelated title',
          body: null,
          user: { login: 'alice' },
          head: { ref: 'feat/PAY-789-payment-gateway' },
          base: { ref: 'main' },
          additions: 0,
          deletions: 0,
          changed_files: 0,
          created_at: PR_OPENED_AT,
          updated_at: PR_OPENED_AT,
          merged: false,
        },
      }),
      'pull_request',
      undefined
    )
    await service.process()

    const event = await PrEvent.query()
      .where('pr_number', 101)
      .where('event_type', 'opened')
      .first()

    assert.equal(event!.linkedTicketId, 'PAY-789')
  })

  test('extracts linked_ticket_id from PR title when branch has none', async ({ assert }) => {
    await seedTechStreamAndRepo()

    const service = new GithubEventNormalizerService(
      buildPullRequestPayload({
        pull_request: {
          number: 102,
          title: 'Fix PAY-999 regression',
          body: null,
          user: { login: 'alice' },
          head: { ref: 'fix/regression' },
          base: { ref: 'main' },
          additions: 5,
          deletions: 2,
          changed_files: 1,
          created_at: PR_OPENED_AT,
          updated_at: PR_OPENED_AT,
          merged: false,
        },
      }),
      'pull_request',
      undefined
    )
    await service.process()

    const event = await PrEvent.query()
      .where('pr_number', 102)
      .where('event_type', 'opened')
      .first()

    assert.equal(event!.linkedTicketId, 'PAY-999')
  })

  test('sets linked_ticket_id to null when no ticket reference found', async ({ assert }) => {
    await seedTechStreamAndRepo()

    const service = new GithubEventNormalizerService(
      buildPullRequestPayload({
        pull_request: {
          number: 103,
          title: 'Update README',
          body: 'Just documentation',
          user: { login: 'alice' },
          head: { ref: 'chore/update-readme' },
          base: { ref: 'main' },
          additions: 2,
          deletions: 1,
          changed_files: 1,
          created_at: PR_OPENED_AT,
          updated_at: PR_OPENED_AT,
          merged: false,
        },
      }),
      'pull_request',
      undefined
    )
    await service.process()

    const event = await PrEvent.query()
      .where('pr_number', 103)
      .where('event_type', 'opened')
      .first()

    assert.isNull(event!.linkedTicketId)
  })

  test('hashes the author login', async ({ assert }) => {
    await seedTechStreamAndRepo()

    const service = new GithubEventNormalizerService(
      buildPullRequestPayload(),
      'pull_request',
      undefined
    )
    await service.process()

    const event = await PrEvent.query()
      .where('pr_number', 101)
      .where('event_type', 'opened')
      .first()

    assert.isNotNull(event!.authorHash)
    assert.notEqual(event!.authorHash, 'alice')
    assert.isString(event!.authorHash)
  })

  test('is idempotent — duplicate event is not inserted', async ({ assert }) => {
    await seedTechStreamAndRepo()
    const payload = buildPullRequestPayload()

    const s1 = new GithubEventNormalizerService(payload, 'pull_request', undefined)
    const s2 = new GithubEventNormalizerService(payload, 'pull_request', undefined)
    await s1.process()
    await s2.process()

    const count = await PrEvent.query()
      .where('pr_number', 101)
      .where('event_type', 'opened')
      .count('* as total')

    assert.equal(Number(count[0].$extras.total), 1)
  })

  test('ignores event when tech_stream not found by install id', async ({ assert }) => {
    // No TechStream seeded with install id 99999
    const payload = buildPullRequestPayload({
      installation: { id: 99999 },
    })

    const service = new GithubEventNormalizerService(payload, 'pull_request', undefined)
    await service.process()

    const count = await PrEvent.query().count('* as total')
    assert.equal(Number(count[0].$extras.total), 0)
  })
})

test.group('Github event normalizer | pull_request closed without merge', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('creates closed event when action=closed and pr.merged=false', async ({ assert }) => {
    const { repo } = await seedTechStreamAndRepo()

    const closedPayload = buildPullRequestPayload({
      action: 'closed',
      pull_request: {
        number: 101,
        title: 'Add feature',
        body: null,
        user: { login: 'alice' },
        head: { ref: 'feat/add-feature' },
        base: { ref: 'main' },
        additions: 50,
        deletions: 10,
        changed_files: 3,
        created_at: PR_OPENED_AT,
        updated_at: PR_REVIEW_AT,
        merged: false,
      },
    })

    const service = new GithubEventNormalizerService(closedPayload, 'pull_request', undefined)
    await service.process()

    const event = await PrEvent.query()
      .where('repo_id', repo.id)
      .where('pr_number', 101)
      .where('event_type', 'closed')
      .first()

    assert.isNotNull(event)
  })
})

test.group('Github event normalizer | pull_request merged', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('creates merged event when action=closed and pr.merged=true', async ({ assert }) => {
    const { repo } = await seedTechStreamAndRepo()

    const mergedPayload = buildPullRequestPayload({
      action: 'closed',
      pull_request: {
        number: 101,
        title: 'Add feature',
        body: null,
        user: { login: 'alice' },
        head: { ref: 'feat/add-feature' },
        base: { ref: 'main' },
        additions: 50,
        deletions: 10,
        changed_files: 3,
        created_at: PR_OPENED_AT,
        updated_at: PR_REVIEW_AT,
        merged: true,
      },
    })

    const service = new GithubEventNormalizerService(mergedPayload, 'pull_request', undefined)
    await service.process()

    const event = await PrEvent.query()
      .where('repo_id', repo.id)
      .where('pr_number', 101)
      .where('event_type', 'merged')
      .first()

    assert.isNotNull(event)
  })
})

test.group('Github event normalizer | pull_request_review', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('creates review_submitted event for commented review', async ({ assert }) => {
    const { repo } = await seedTechStreamAndRepo()

    const service = new GithubEventNormalizerService(
      buildPrReviewPayload(),
      'pull_request_review',
      undefined
    )
    await service.process()

    const event = await PrEvent.query()
      .where('repo_id', repo.id)
      .where('pr_number', 101)
      .where('event_type', 'review_submitted')
      .first()

    assert.isNotNull(event)
    assert.isNotNull(event!.reviewerHash)
    assert.notEqual(event!.reviewerHash, 'bob')
  })

  test('creates approved event for approved review', async ({ assert }) => {
    const { repo } = await seedTechStreamAndRepo()

    const service = new GithubEventNormalizerService(
      buildPrReviewPayload({
        review: {
          state: 'approved',
          user: { login: 'bob' },
          submitted_at: PR_REVIEW_AT,
        },
      }),
      'pull_request_review',
      undefined
    )
    await service.process()

    const event = await PrEvent.query()
      .where('repo_id', repo.id)
      .where('pr_number', 101)
      .where('event_type', 'approved')
      .first()

    assert.isNotNull(event)
  })

  test('creates changes_requested event', async ({ assert }) => {
    const { repo } = await seedTechStreamAndRepo()

    const service = new GithubEventNormalizerService(
      buildPrReviewPayload({
        review: {
          state: 'changes_requested',
          user: { login: 'bob' },
          submitted_at: PR_REVIEW_AT,
        },
      }),
      'pull_request_review',
      undefined
    )
    await service.process()

    const event = await PrEvent.query()
      .where('repo_id', repo.id)
      .where('pr_number', 101)
      .where('event_type', 'changes_requested')
      .first()

    assert.isNotNull(event)
  })
})

test.group('Github event normalizer | unknown event types', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('does nothing for unknown github event type', async ({ assert }) => {
    await seedTechStreamAndRepo()

    const service = new GithubEventNormalizerService(
      { action: 'push', ref: 'refs/heads/main' },
      'push',
      undefined
    )
    await service.process()

    const count = await PrEvent.query().count('* as total')
    assert.equal(Number(count[0].$extras.total), 0)
  })
})

test.group('Github event normalizer | signature verification', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('throws when signature is invalid', async ({ assert }) => {
    await seedTechStreamAndRepo()

    // Use a non-null signature to force verification
    const service = new GithubEventNormalizerService(
      buildPullRequestPayload(),
      'pull_request',
      'sha256=invalidsignature',
      'mysecret'
    )

    await assert.rejects(() => service.process(), /invalid signature/i)
  })
})

test.group('Github event normalizer | PR cycle trigger', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('triggers pr_cycle computation after merged event', async ({ assert }) => {
    const { repo, techStream } = await seedTechStreamAndRepo()

    // First create an opened event so the cycle computation has data
    await PrEvent.create({
      source: 'github',
      eventType: 'opened',
      prNumber: 101,
      repoId: repo.id,
      githubOrg: 'acme-platform',
      githubRepo: 'api-service',
      techStreamId: techStream.id,
      eventTimestamp: DateTime.fromISO(PR_OPENED_AT),
    })

    const mergedPayload = buildPullRequestPayload({
      action: 'closed',
      pull_request: {
        number: 101,
        title: 'Add feature',
        body: null,
        user: { login: 'alice' },
        head: { ref: 'feat/add-feature' },
        base: { ref: 'main' },
        additions: 50,
        deletions: 10,
        changed_files: 3,
        created_at: PR_OPENED_AT,
        updated_at: PR_REVIEW_AT,
        merged: true,
      },
    })

    const service = new GithubEventNormalizerService(mergedPayload, 'pull_request', undefined)
    await service.process()

    // PrCycle should have been created
    const { default: PrCycle } = await import('#models/pr_cycle')
    const cycle = await PrCycle.query().where('repo_id', repo.id).where('pr_number', 101).first()

    assert.isNotNull(cycle)
  })
})

test.group('GithubEventNormalizer | ticket regex', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('extracts ticket id using default regex when tech stream has no custom regex', async ({
    assert,
  }) => {
    const { techStream } = await seedTechStreamAndRepo()
    // ticketRegex is not set — default regex should apply
    assert.isNotOk(techStream.ticketRegex)

    const payload = buildPullRequestPayload({
      pull_request: {
        number: 201,
        title: 'PROJ-123: some feature',
        body: null,
        user: { login: 'alice' },
        head: { ref: 'feat/something' },
        base: { ref: 'main' },
        additions: 1,
        deletions: 0,
        changed_files: 1,
        created_at: PR_OPENED_AT,
        updated_at: PR_OPENED_AT,
        merged: false,
      },
    })

    const service = new GithubEventNormalizerService(payload, 'pull_request', undefined)
    await service.process()

    const event = await PrEvent.query().where('pr_number', 201).where('event_type', 'opened').first()
    assert.equal(event!.linkedTicketId, 'PROJ-123')
  })

  test('extracts ticket id using custom regex from tech stream when set', async ({ assert }) => {
    const { techStream } = await seedTechStreamAndRepo()
    // Set a custom regex that matches lowercase tickets like feat-123
    techStream.ticketRegex = '(feat-\\d+)'
    await techStream.save()

    const payload = buildPullRequestPayload({
      pull_request: {
        number: 202,
        title: 'some title without PROJ prefix',
        body: null,
        user: { login: 'alice' },
        head: { ref: 'feat-456-my-feature' },
        base: { ref: 'main' },
        additions: 1,
        deletions: 0,
        changed_files: 1,
        created_at: PR_OPENED_AT,
        updated_at: PR_OPENED_AT,
        merged: false,
      },
    })

    const service = new GithubEventNormalizerService(payload, 'pull_request', undefined)
    await service.process()

    const event = await PrEvent.query().where('pr_number', 202).where('event_type', 'opened').first()
    assert.equal(event!.linkedTicketId, 'feat-456')
  })

  test('falls back to null when custom regex does not match', async ({ assert }) => {
    const { techStream } = await seedTechStreamAndRepo()
    techStream.ticketRegex = '(CUSTOM-\\d+)'
    await techStream.save()

    const payload = buildPullRequestPayload({
      pull_request: {
        number: 203,
        title: 'unrelated title',
        body: null,
        user: { login: 'alice' },
        head: { ref: 'chore/cleanup' },
        base: { ref: 'main' },
        additions: 1,
        deletions: 0,
        changed_files: 1,
        created_at: PR_OPENED_AT,
        updated_at: PR_OPENED_AT,
        merged: false,
      },
    })

    const service = new GithubEventNormalizerService(payload, 'pull_request', undefined)
    await service.process()

    const event = await PrEvent.query().where('pr_number', 203).where('event_type', 'opened').first()
    assert.isNull(event!.linkedTicketId)
  })
})
