import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { createHmac } from 'node:crypto'
import TechStream from '#models/tech_stream'
import Repository from '#models/repository'
import PrEvent from '#models/pr_event'
import CicdEvent from '#models/cicd_event'
import DeploymentRecord from '#models/deployment_record'
import EventQueueService from '#services/event_queue_service'

const WEBHOOK_PATH = '/api/v1/webhooks/github'
const WEBHOOK_SECRET = 'test-github-secret'

function buildPrOpenedPayload(prNumber: number = 1) {
  return {
    action: 'opened',
    installation: { id: 99001 },
    pull_request: {
      number: prNumber,
      title: 'Add PAY-500 payment processing',
      body: null,
      user: { login: 'developer' },
      head: { ref: 'feat/PAY-500-payments' },
      base: { ref: 'main' },
      additions: 200,
      deletions: 50,
      changed_files: 8,
      created_at: '2026-02-10T09:00:00Z',
      updated_at: '2026-02-10T09:00:00Z',
      merged: false,
    },
    repository: {
      full_name: 'acme-org/backend',
      name: 'backend',
      owner: { login: 'acme-org' },
    },
  }
}

function signPayload(payload: object, secret: string): string {
  const body = JSON.stringify(payload)
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex')
}

async function seedTechStreamAndRepo() {
  const techStream = await TechStream.create({
    name: 'backend',
    displayName: 'Backend',
    githubOrg: 'acme-org',
    githubInstallId: '99001',
    isActive: true,
  })

  const repo = await Repository.create({
    techStreamId: techStream.id,
    githubOrg: 'acme-org',
    githubRepoName: 'backend',
    fullName: 'acme-org/backend',
    defaultBranch: 'main',
    isDeployable: true,
    isActive: true,
  })

  return { techStream, repo }
}

async function drainQueue() {
  await new EventQueueService().processPending()
}

test.group('Github Webhooks | pull_request events', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns 202 for pull_request opened event', async ({ client }) => {
    await seedTechStreamAndRepo()
    const payload = buildPrOpenedPayload()

    const response = await client
      .post(WEBHOOK_PATH)
      .header('x-github-event', 'pull_request')
      .json(payload)

    response.assertStatus(202)
  })

  test('creates a pr_event record in the database', async ({ client, assert }) => {
    const { repo } = await seedTechStreamAndRepo()
    const payload = buildPrOpenedPayload(42)

    await client.post(WEBHOOK_PATH).header('x-github-event', 'pull_request').json(payload)
    await drainQueue()

    const event = await PrEvent.query()
      .where('repo_id', repo.id)
      .where('pr_number', 42)
      .where('event_type', 'opened')
      .first()

    assert.isNotNull(event)
    assert.equal(event!.source, 'github')
    assert.equal(event!.linkedTicketId, 'PAY-500')
  })

  test('returns 202 for unknown event types (silently ignored)', async ({ client }) => {
    await seedTechStreamAndRepo()

    const response = await client
      .post(WEBHOOK_PATH)
      .header('x-github-event', 'push')
      .json({ ref: 'refs/heads/main', commits: [] })

    response.assertStatus(202)
  })

  test('does not require CSRF token — webhook is CSRF-exempt', async ({ client, assert }) => {
    await seedTechStreamAndRepo()
    const payload = buildPrOpenedPayload(77)

    // No .withCsrfToken() — should still succeed
    const response = await client
      .post(WEBHOOK_PATH)
      .header('x-github-event', 'pull_request')
      .json(payload)

    response.assertStatus(202)

    await drainQueue()

    const event = await PrEvent.query().where('pr_number', 77).first()
    assert.isNotNull(event)
  })
})

test.group('Github Webhooks | pull_request_review events', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns 202 and creates review event', async ({ client, assert }) => {
    const { repo } = await seedTechStreamAndRepo()

    const reviewPayload = {
      action: 'submitted',
      installation: { id: 99001 },
      review: {
        state: 'approved',
        user: { login: 'reviewer' },
        submitted_at: '2026-02-11T10:00:00Z',
      },
      pull_request: {
        number: 43,
        title: 'Fix bug',
        body: null,
        user: { login: 'developer' },
        head: { ref: 'fix/bug' },
        base: { ref: 'main' },
      },
      repository: {
        full_name: 'acme-org/backend',
        name: 'backend',
        owner: { login: 'acme-org' },
      },
    }

    const response = await client
      .post(WEBHOOK_PATH)
      .header('x-github-event', 'pull_request_review')
      .json(reviewPayload)

    response.assertStatus(202)

    await drainQueue()

    const event = await PrEvent.query()
      .where('repo_id', repo.id)
      .where('pr_number', 43)
      .where('event_type', 'approved')
      .first()

    assert.isNotNull(event)
    assert.isNotNull(event!.reviewerHash)
  })
})

test.group('Github Webhooks | unexpected errors', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns 202 for malformed payload — errors handled async in queue processor', async ({
    client,
  }) => {
    await seedTechStreamAndRepo()

    // Omitting pull_request field — service will fail when processing queue
    // Controller enqueues and returns 202 regardless; queue processor dead-letters after 3 attempts
    const malformedPayload = {
      action: 'opened',
      installation: { id: 99001 },
      repository: {
        full_name: 'acme-org/backend',
        name: 'backend',
        owner: { login: 'acme-org' },
      },
    }

    const response = await client
      .post(WEBHOOK_PATH)
      .header('x-github-event', 'pull_request')
      .json(malformedPayload)

    response.assertStatus(202)
  })
})

test.group('Github Webhooks | signature verification', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns 401 when signature is invalid', async ({ client }) => {
    await seedTechStreamAndRepo()
    const payload = buildPrOpenedPayload()

    const response = await client
      .post(WEBHOOK_PATH)
      .header('x-github-event', 'pull_request')
      .header('x-hub-signature-256', 'sha256=invalidsignature')
      .json(payload)

    response.assertStatus(401)
  })

  test('returns 202 when signature is valid', async ({ client }) => {
    await seedTechStreamAndRepo()
    const payload = buildPrOpenedPayload(55)
    const signature = signPayload(payload, WEBHOOK_SECRET)

    const response = await client
      .post(WEBHOOK_PATH)
      .header('x-github-event', 'pull_request')
      .header('x-hub-signature-256', signature)
      .json(payload)

    response.assertStatus(202)
  })
})

test.group('Github Webhooks | workflow_run events', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('accepts workflow_run webhook and writes cicd_event', async ({ client, assert }) => {
    const techStream = await TechStream.create({
      name: 'backend-ci',
      displayName: 'Backend CI',
      githubOrg: 'acme-org',
      githubInstallId: '77001',
      isActive: true,
    })
    await Repository.create({
      techStreamId: techStream.id,
      githubOrg: 'acme-org',
      githubRepoName: 'backend',
      fullName: 'acme-org/backend',
      isActive: true,
    })

    const payload = {
      action: 'completed',
      installation: { id: 77001 },
      workflow_run: {
        id: 55001,
        workflow_id: 66001,
        conclusion: 'success',
        status: 'completed',
        head_sha: 'abc123',
        created_at: '2026-02-10T10:00:00Z',
        updated_at: '2026-02-10T10:01:00Z',
        run_started_at: '2026-02-10T10:00:00Z',
      },
      repository: {
        full_name: 'acme-org/backend',
        name: 'backend',
        owner: { login: 'acme-org' },
      },
    }

    const response = await client
      .post(WEBHOOK_PATH)
      .header('x-github-event', 'workflow_run')
      .json(payload)

    response.assertStatus(202)

    await drainQueue()

    const event = await CicdEvent.query().where('pipeline_run_id', '55001').first()
    assert.isNotNull(event)
    assert.equal(event!.eventType, 'build_completed')
    assert.equal(event!.status, 'success')
  })
})

test.group('Github Webhooks | deployment_status events', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('accepts deployment_status webhook and writes cicd_event and deployment_record', async ({
    client,
    assert,
  }) => {
    const techStream = await TechStream.create({
      name: 'backend-deploy',
      displayName: 'Backend Deploy',
      githubOrg: 'acme-org',
      githubInstallId: '77002',
      isActive: true,
    })
    await Repository.create({
      techStreamId: techStream.id,
      githubOrg: 'acme-org',
      githubRepoName: 'backend',
      fullName: 'acme-org/backend',
      isActive: true,
    })

    const payload = {
      action: 'created',
      installation: { id: 77002 },
      deployment: {
        id: 88001,
        sha: 'def456',
        environment: 'production',
      },
      deployment_status: {
        id: 99001,
        state: 'success',
        environment: 'production',
        created_at: '2026-02-10T12:00:00Z',
      },
      repository: {
        full_name: 'acme-org/backend',
        name: 'backend',
        owner: { login: 'acme-org' },
      },
    }

    const response = await client
      .post(WEBHOOK_PATH)
      .header('x-github-event', 'deployment_status')
      .json(payload)

    response.assertStatus(202)

    await drainQueue()

    const event = await CicdEvent.query().where('pipeline_id', '88001').first()
    assert.isNotNull(event)
    assert.equal(event!.eventType, 'deploy_completed')

    const deployRecord = await DeploymentRecord.query()
      .where('tech_stream_id', techStream.id)
      .where('environment', 'production')
      .first()
    assert.isNotNull(deployRecord)
  })
})
