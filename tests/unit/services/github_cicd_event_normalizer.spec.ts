import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import TechStream from '#models/tech_stream'
import Repository from '#models/repository'
import PrCycle from '#models/pr_cycle'
import CicdEvent from '#models/cicd_event'
import DeploymentRecord from '#models/deployment_record'
import GithubEventNormalizerService from '#services/github_event_normalizer_service'

async function seedTechStream(installId = '88001') {
  return TechStream.create({
    name: `cicd-ts-${installId}`,
    displayName: `CICD TS ${installId}`,
    githubOrg: 'acme-org',
    githubInstallId: installId,
    isActive: true,
  })
}

async function seedRepo(techStreamId: number) {
  return Repository.create({
    techStreamId,
    githubOrg: 'acme-org',
    githubRepoName: 'backend',
    fullName: 'acme-org/backend',
    defaultBranch: 'main',
    isDeployable: true,
    isActive: true,
  })
}

function buildWorkflowRunPayload(opts: {
  action?: string
  conclusion?: string
  workflowId?: number
  runId?: number
  installId?: number
  runAt?: string
}) {
  return {
    action: opts.action ?? 'completed',
    installation: { id: opts.installId ?? 88001 },
    workflow_run: {
      id: opts.runId ?? 12345,
      workflow_id: opts.workflowId ?? 999,
      conclusion: opts.conclusion ?? 'success',
      status: 'completed',
      head_sha: 'abc123',
      created_at: opts.runAt ?? '2026-02-10T10:00:00Z',
      updated_at: opts.runAt ?? '2026-02-10T10:01:00Z',
      run_started_at: opts.runAt ?? '2026-02-10T10:00:00Z',
    },
    repository: {
      full_name: 'acme-org/backend',
      name: 'backend',
      owner: { login: 'acme-org' },
    },
  }
}

function buildDeploymentStatusPayload(opts: {
  state?: string
  environment?: string
  installId?: number
  deploymentId?: number
  runId?: number
}) {
  return {
    action: 'created',
    installation: { id: opts.installId ?? 88001 },
    deployment: {
      id: opts.deploymentId ?? 5001,
      sha: 'def456',
      environment: opts.environment ?? 'production',
    },
    deployment_status: {
      id: opts.runId ?? 9001,
      state: opts.state ?? 'success',
      environment: opts.environment ?? 'production',
      created_at: '2026-02-10T12:00:00Z',
    },
    repository: {
      full_name: 'acme-org/backend',
      name: 'backend',
      owner: { login: 'acme-org' },
    },
  }
}

test.group('GithubCicdEventNormalizer | workflow_run', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('ignores workflow_run events with non-completed action', async ({ assert }) => {
    const ts = await seedTechStream()
    await seedRepo(ts.id)

    const payload = buildWorkflowRunPayload({ action: 'in_progress' })
    await new GithubEventNormalizerService(payload, 'workflow_run').process()

    const events = await CicdEvent.query().where('pipeline_run_id', '12345')
    assert.equal(events.length, 0)
  })

  test('creates cicd_event for workflow_run completed with success conclusion', async ({
    assert,
  }) => {
    const ts = await seedTechStream()
    await seedRepo(ts.id)

    const payload = buildWorkflowRunPayload({ conclusion: 'success', workflowId: 100, runId: 200 })
    await new GithubEventNormalizerService(payload, 'workflow_run').process()

    const event = await CicdEvent.query().where('pipeline_run_id', '200').first()
    assert.isNotNull(event)
    assert.equal(event!.eventType, 'build_completed')
    assert.equal(event!.status, 'success')
    assert.equal(event!.pipelineId, '100')
    assert.equal(event!.techStreamId, ts.id)
  })

  test('creates cicd_event for workflow_run completed with failure conclusion', async ({
    assert,
  }) => {
    const ts = await seedTechStream()
    await seedRepo(ts.id)

    const payload = buildWorkflowRunPayload({ conclusion: 'failure', workflowId: 101, runId: 201 })
    await new GithubEventNormalizerService(payload, 'workflow_run').process()

    const event = await CicdEvent.query().where('pipeline_run_id', '201').first()
    assert.isNotNull(event)
    assert.equal(event!.eventType, 'build_completed')
    assert.equal(event!.status, 'failure')
  })

  test('is idempotent for duplicate workflow_run events', async ({ assert }) => {
    const ts = await seedTechStream()
    await seedRepo(ts.id)

    const payload = buildWorkflowRunPayload({ workflowId: 102, runId: 202 })
    await new GithubEventNormalizerService(payload, 'workflow_run').process()
    await new GithubEventNormalizerService(payload, 'workflow_run').process()

    const events = await CicdEvent.query().where('pipeline_run_id', '202')
    assert.equal(events.length, 1)
  })
})

test.group('GithubCicdEventNormalizer | deployment_status', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('creates cicd_event for deployment_status success', async ({ assert }) => {
    const ts = await seedTechStream()
    await seedRepo(ts.id)

    const payload = buildDeploymentStatusPayload({
      state: 'success',
      environment: 'staging',
      deploymentId: 6001,
      runId: 9101,
    })
    await new GithubEventNormalizerService(payload, 'deployment_status').process()

    const event = await CicdEvent.query().where('pipeline_id', '6001').first()
    assert.isNotNull(event)
    assert.equal(event!.eventType, 'deploy_completed')
    assert.equal(event!.status, 'success')
    assert.equal(event!.environment, 'staging')
  })

  test('creates cicd_event for deployment_status failure', async ({ assert }) => {
    const ts = await seedTechStream()
    await seedRepo(ts.id)

    const payload = buildDeploymentStatusPayload({
      state: 'failure',
      environment: 'production',
      deploymentId: 6002,
      runId: 9102,
    })
    await new GithubEventNormalizerService(payload, 'deployment_status').process()

    const event = await CicdEvent.query().where('pipeline_id', '6002').first()
    assert.isNotNull(event)
    assert.equal(event!.eventType, 'deploy_failed')
    assert.equal(event!.status, 'failure')
  })

  test('creates deployment_record for production deploy_completed event', async ({ assert }) => {
    const ts = await seedTechStream()
    await seedRepo(ts.id)

    const payload = buildDeploymentStatusPayload({
      state: 'success',
      environment: 'production',
      deploymentId: 7001,
      runId: 9201,
    })
    await new GithubEventNormalizerService(payload, 'deployment_status').process()

    const deployRecord = await DeploymentRecord.query()
      .where('tech_stream_id', ts.id)
      .where('environment', 'production')
      .first()

    assert.isNotNull(deployRecord)
    assert.equal(deployRecord!.status, 'success')
  })

  test('does not create deployment_record for non-production deploy', async ({ assert }) => {
    const ts = await seedTechStream()
    await seedRepo(ts.id)

    const payload = buildDeploymentStatusPayload({
      state: 'success',
      environment: 'staging',
      deploymentId: 7002,
      runId: 9202,
    })
    await new GithubEventNormalizerService(payload, 'deployment_status').process()

    const deployRecord = await DeploymentRecord.query()
      .where('tech_stream_id', ts.id)
      .where('environment', 'staging')
      .first()

    assert.isNull(deployRecord)
  })

  test('ignores unsupported github event types', async ({ assert }) => {
    const ts = await seedTechStream()
    await seedRepo(ts.id)

    await new GithubEventNormalizerService({ ref: 'refs/heads/main' }, 'push').process()

    const events = await CicdEvent.query().where('tech_stream_id', ts.id)
    assert.equal(events.length, 0)
  })

  test('does not create deployment_record when repo is not deployable', async ({ assert }) => {
    const ts = await seedTechStream('88002')
    await Repository.create({
      techStreamId: ts.id,
      githubOrg: 'acme-org',
      githubRepoName: 'backend',
      fullName: 'acme-org/backend',
      defaultBranch: 'main',
      isDeployable: false,
      isActive: true,
    })

    const payload = buildDeploymentStatusPayload({
      state: 'success',
      environment: 'production',
      deploymentId: 8001,
      runId: 9301,
      installId: 88002,
    })
    await new GithubEventNormalizerService(payload, 'deployment_status').process()

    const deployRecord = await DeploymentRecord.query()
      .where('tech_stream_id', ts.id)
      .where('environment', 'production')
      .first()

    assert.isNull(deployRecord)
  })
})

test.group('GithubCicdEventNormalizer | event_timestamp', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('sets event_timestamp from workflow_run updated_at', async ({ assert }) => {
    const ts = await seedTechStream()
    await seedRepo(ts.id)

    const runAt = '2026-02-15T14:30:00Z'
    const payload = buildWorkflowRunPayload({ workflowId: 300, runId: 400, runAt })
    await new GithubEventNormalizerService(payload, 'workflow_run').process()

    const event = await CicdEvent.query().where('pipeline_run_id', '400').first()
    assert.isNotNull(event)
    const eventTs = event!.eventTimestamp
    assert.equal(DateTime.fromISO(runAt).toISO()!.slice(0, 19), eventTs.toISO()!.slice(0, 19))
  })
})

// Deploy timestamp used by buildDeploymentStatusPayload default
const DEPLOY_AT = DateTime.fromISO('2026-02-10T12:00:00Z')

test.group('GithubCicdEventNormalizer | deployment_status lead time', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('computes lead_time_hrs from most recently merged PrCycle within 7 days', async ({
    assert,
  }) => {
    const ts = await seedTechStream('88010')
    const repo = await seedRepo(ts.id)

    // PrCycle: openedAt = 10h before deploy, mergedAt = 2h before deploy
    await PrCycle.create({
      repoId: repo.id,
      techStreamId: ts.id,
      prNumber: 100,
      openedAt: DEPLOY_AT.minus({ hours: 10 }),
      mergedAt: DEPLOY_AT.minus({ hours: 2 }),
    })

    const payload = buildDeploymentStatusPayload({
      state: 'success',
      environment: 'production',
      deploymentId: 11001,
      runId: 12001,
      installId: 88010,
    })
    await new GithubEventNormalizerService(payload, 'deployment_status').process()

    const record = await DeploymentRecord.query().where('tech_stream_id', ts.id).first()
    assert.isNotNull(record)
    // leadTimeHrs = deployedAt - openedAt = 10h
    assert.approximately(Number(record!.leadTimeHrs!), 10, 0.1)
  })

  test('sets linkedTicketId from the matched PrCycle', async ({ assert }) => {
    const ts = await seedTechStream('88011')
    const repo = await seedRepo(ts.id)

    await PrCycle.create({
      repoId: repo.id,
      techStreamId: ts.id,
      prNumber: 101,
      openedAt: DEPLOY_AT.minus({ hours: 8 }),
      mergedAt: DEPLOY_AT.minus({ hours: 1 }),
      linkedTicketId: 'PAY-42',
    })

    const payload = buildDeploymentStatusPayload({
      state: 'success',
      environment: 'production',
      deploymentId: 11002,
      runId: 12002,
      installId: 88011,
    })
    await new GithubEventNormalizerService(payload, 'deployment_status').process()

    const record = await DeploymentRecord.query().where('tech_stream_id', ts.id).first()
    assert.isNotNull(record)
    assert.equal(record!.linkedTicketId, 'PAY-42')
  })

  test('lead_time_hrs is null when no PrCycle merged within 7 days', async ({ assert }) => {
    const ts = await seedTechStream('88012')
    const repo = await seedRepo(ts.id)

    // PrCycle merged 8 days ago — outside the 7-day window
    await PrCycle.create({
      repoId: repo.id,
      techStreamId: ts.id,
      prNumber: 102,
      openedAt: DEPLOY_AT.minus({ days: 10 }),
      mergedAt: DEPLOY_AT.minus({ days: 8 }),
    })

    const payload = buildDeploymentStatusPayload({
      state: 'success',
      environment: 'production',
      deploymentId: 11003,
      runId: 12003,
      installId: 88012,
    })
    await new GithubEventNormalizerService(payload, 'deployment_status').process()

    const record = await DeploymentRecord.query().where('tech_stream_id', ts.id).first()
    assert.isNotNull(record)
    assert.isNull(record!.leadTimeHrs)
  })

  test('selects most recently merged PrCycle when multiple exist in window', async ({ assert }) => {
    const ts = await seedTechStream('88013')
    const repo = await seedRepo(ts.id)

    // PrCycle 1: merged 1h ago, openedAt 12h ago → leadTimeHrs = 12
    await PrCycle.create({
      repoId: repo.id,
      techStreamId: ts.id,
      prNumber: 103,
      openedAt: DEPLOY_AT.minus({ hours: 12 }),
      mergedAt: DEPLOY_AT.minus({ hours: 1 }),
    })

    // PrCycle 2: merged 3h ago, openedAt 20h ago → leadTimeHrs = 20
    await PrCycle.create({
      repoId: repo.id,
      techStreamId: ts.id,
      prNumber: 104,
      openedAt: DEPLOY_AT.minus({ hours: 20 }),
      mergedAt: DEPLOY_AT.minus({ hours: 3 }),
    })

    const payload = buildDeploymentStatusPayload({
      state: 'success',
      environment: 'production',
      deploymentId: 11004,
      runId: 12004,
      installId: 88013,
    })
    await new GithubEventNormalizerService(payload, 'deployment_status').process()

    const record = await DeploymentRecord.query().where('tech_stream_id', ts.id).first()
    assert.isNotNull(record)
    // Should pick PrCycle 1 (most recently merged) → leadTimeHrs = 12
    assert.approximately(Number(record!.leadTimeHrs!), 12, 0.1)
  })

  test('sets repoId on DeploymentRecord from the webhook path', async ({ assert }) => {
    const ts = await seedTechStream('88014')
    const repo = await seedRepo(ts.id)

    const payload = buildDeploymentStatusPayload({
      state: 'success',
      environment: 'production',
      deploymentId: 11005,
      runId: 12005,
      installId: 88014,
    })
    await new GithubEventNormalizerService(payload, 'deployment_status').process()

    const record = await DeploymentRecord.query().where('tech_stream_id', ts.id).first()
    assert.isNotNull(record)
    assert.equal(record!.repoId, repo.id)
  })
})
