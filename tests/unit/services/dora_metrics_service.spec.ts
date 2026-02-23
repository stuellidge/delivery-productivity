import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import TechStream from '#models/tech_stream'
import Repository from '#models/repository'
import DeploymentRecord from '#models/deployment_record'
import IncidentEvent from '#models/incident_event'
import DoraMetricsService from '#services/dora_metrics_service'

const NOW = DateTime.now()
const WITHIN_WINDOW = NOW.minus({ days: 10 })
const OUTSIDE_WINDOW = NOW.minus({ days: 60 })

async function seedTechStream() {
  return TechStream.create({
    name: 'backend',
    displayName: 'Backend',
    githubOrg: 'acme',
    githubInstallId: '11111',
    isActive: true,
  })
}

async function seedDeploy(
  techStreamId: number,
  deployedAt: DateTime,
  status: 'success' | 'failed' | 'rolled_back' | 'cancelled' = 'success',
  causedIncident = false,
  environment = 'production',
  leadTimeHrs: number | null = null
) {
  return DeploymentRecord.create({
    techStreamId,
    environment,
    status,
    deployedAt,
    causedIncident,
    leadTimeHrs,
  })
}

async function seedIncident(
  techStreamId: number,
  incidentId: string,
  occurredAt: DateTime,
  timeToRestoreMin: number | null = null
) {
  return IncidentEvent.create({
    eventType: 'alarm_triggered',
    incidentId,
    serviceName: 'api-service',
    techStreamId,
    occurredAt,
    timeToRestoreMin,
  })
}

test.group('DoraMetricsService | deployment frequency', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns 0 frequency when no deployments', async ({ assert }) => {
    const ts = await seedTechStream()
    const service = new DoraMetricsService(ts.id, 30)
    const result = await service.compute()
    assert.equal(result.deploymentFrequency, 0)
  })

  test('computes deployments per week for production deploys in window', async ({ assert }) => {
    const ts = await seedTechStream()
    // 4 production deploys within 30d window = 4/4.29 weeks ≈ 0.93/week
    await seedDeploy(ts.id, WITHIN_WINDOW)
    await seedDeploy(ts.id, WITHIN_WINDOW.minus({ days: 2 }))
    await seedDeploy(ts.id, WITHIN_WINDOW.minus({ days: 5 }))
    await seedDeploy(ts.id, WITHIN_WINDOW.minus({ days: 8 }))

    const service = new DoraMetricsService(ts.id, 30)
    const result = await service.compute()
    // 4 deploys over 30 days = 4 / (30/7) ≈ 0.93 per week
    assert.approximately(result.deploymentFrequency, 0.93, 0.1)
  })

  test('excludes non-production deployments from frequency', async ({ assert }) => {
    const ts = await seedTechStream()
    await seedDeploy(ts.id, WITHIN_WINDOW, 'success', false, 'staging')
    await seedDeploy(ts.id, WITHIN_WINDOW, 'success', false, 'production')

    const service = new DoraMetricsService(ts.id, 30)
    const result = await service.compute()
    // Only 1 production deploy
    assert.approximately(result.deploymentFrequency, 1 / (30 / 7), 0.1)
  })

  test('excludes deploys outside the window', async ({ assert }) => {
    const ts = await seedTechStream()
    await seedDeploy(ts.id, OUTSIDE_WINDOW) // excluded
    await seedDeploy(ts.id, WITHIN_WINDOW) // included

    const service = new DoraMetricsService(ts.id, 30)
    const result = await service.compute()
    assert.approximately(result.deploymentFrequency, 1 / (30 / 7), 0.1)
  })

  test('excludes deployment linked to non-deployable repo', async ({ assert }) => {
    const ts = await seedTechStream()
    const repo = await Repository.create({
      techStreamId: ts.id,
      githubOrg: 'acme',
      githubRepoName: 'infra',
      fullName: 'acme/infra',
      defaultBranch: 'main',
      isDeployable: false,
      isActive: true,
    })
    await DeploymentRecord.create({
      techStreamId: ts.id,
      repoId: repo.id,
      environment: 'production',
      status: 'success',
      deployedAt: WITHIN_WINDOW,
      causedIncident: false,
    })

    const service = new DoraMetricsService(ts.id, 30)
    const result = await service.compute()
    assert.equal(result.deploymentFrequency, 0)
  })

  test('excludes config-only deployment from frequency', async ({ assert }) => {
    const ts = await seedTechStream()
    await DeploymentRecord.create({
      techStreamId: ts.id,
      environment: 'production',
      status: 'success',
      deployedAt: WITHIN_WINDOW,
      causedIncident: false,
      triggerType: 'config',
    })

    const service = new DoraMetricsService(ts.id, 30)
    const result = await service.compute()
    assert.equal(result.deploymentFrequency, 0)
  })
})

test.group('DoraMetricsService | change failure rate', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns 0 when no deployments', async ({ assert }) => {
    const ts = await seedTechStream()
    const service = new DoraMetricsService(ts.id, 30)
    const result = await service.compute()
    assert.equal(result.changeFailureRate, 0)
  })

  test('computes change failure rate as percentage of deploys that caused incidents', async ({
    assert,
  }) => {
    const ts = await seedTechStream()
    await seedDeploy(ts.id, WITHIN_WINDOW, 'success', true) // caused incident
    await seedDeploy(ts.id, WITHIN_WINDOW, 'success', false) // good
    await seedDeploy(ts.id, WITHIN_WINDOW, 'success', false) // good
    await seedDeploy(ts.id, WITHIN_WINDOW, 'success', false) // good

    const service = new DoraMetricsService(ts.id, 30)
    const result = await service.compute()
    // 1 out of 4 = 25%
    assert.approximately(result.changeFailureRate, 25, 0.5)
  })

  test('excludes config-only deployment from change failure rate', async ({ assert }) => {
    const ts = await seedTechStream()
    await seedDeploy(ts.id, WITHIN_WINDOW, 'success', true) // normal, caused incident
    await DeploymentRecord.create({
      techStreamId: ts.id,
      environment: 'production',
      status: 'success',
      deployedAt: WITHIN_WINDOW,
      causedIncident: false,
      triggerType: 'config',
    })

    const service = new DoraMetricsService(ts.id, 30)
    const result = await service.compute()
    // config deploy excluded — only 1 normal deploy, it caused incident = 100%
    assert.approximately(result.changeFailureRate, 100, 1)
  })
})

test.group('DoraMetricsService | time to restore', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns 0 median and mean when no incidents with TTR data', async ({ assert }) => {
    const ts = await seedTechStream()
    const service = new DoraMetricsService(ts.id, 30)
    const result = await service.compute()
    assert.equal(result.ttrMedian, 0)
    assert.equal(result.ttrMean, 0)
  })

  test('computes TTR median and mean from incidents in window', async ({ assert }) => {
    const ts = await seedTechStream()
    await seedIncident(ts.id, 'INC-1', WITHIN_WINDOW, 60)
    await seedIncident(ts.id, 'INC-2', WITHIN_WINDOW, 120)
    await seedIncident(ts.id, 'INC-3', WITHIN_WINDOW, 30)

    const service = new DoraMetricsService(ts.id, 30)
    const result = await service.compute()

    // Sorted: 30, 60, 120 — median = 60, mean = 70
    assert.approximately(result.ttrMedian, 60, 1)
    assert.approximately(result.ttrMean, 70, 1)
  })
})

test.group('DoraMetricsService | lead time', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns null p50 and p85 when no deployments with lead time', async ({ assert }) => {
    const ts = await seedTechStream()
    const service = new DoraMetricsService(ts.id, 30)
    const result = await service.compute()
    assert.isNull(result.leadTimeP50)
    assert.isNull(result.leadTimeP85)
  })

  test('computes lead time p50 and p85 from production deploys', async ({ assert }) => {
    const ts = await seedTechStream()
    await seedDeploy(ts.id, WITHIN_WINDOW, 'success', false, 'production', 4)
    await seedDeploy(ts.id, WITHIN_WINDOW, 'success', false, 'production', 8)
    await seedDeploy(ts.id, WITHIN_WINDOW, 'success', false, 'production', 12)
    await seedDeploy(ts.id, WITHIN_WINDOW, 'success', false, 'production', 16)
    await seedDeploy(ts.id, WITHIN_WINDOW, 'success', false, 'production', 20)

    const service = new DoraMetricsService(ts.id, 30)
    const result = await service.compute()

    // Sorted: 4,8,12,16,20 — p50=12
    assert.isNotNull(result.leadTimeP50)
    assert.approximately(result.leadTimeP50!, 12, 0.5)
    assert.isNotNull(result.leadTimeP85)
    assert.isAbove(result.leadTimeP85!, 16)
  })
})
