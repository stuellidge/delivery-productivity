import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import TechStream from '#models/tech_stream'
import Repository from '#models/repository'
import PrCycle from '#models/pr_cycle'
import DeploymentEventService from '#services/deployment_event_service'

async function seedTechStream() {
  return TechStream.create({
    name: 'backend',
    displayName: 'Backend',
    githubOrg: 'acme',
    githubInstallId: '11111',
    isActive: true,
  })
}

async function seedRepo(techStreamId: number, fullName = 'acme/api') {
  return Repository.create({
    techStreamId,
    githubOrg: 'acme',
    githubRepoName: 'api',
    fullName,
    defaultBranch: 'main',
    isDeployable: true,
    isActive: true,
  })
}

test.group('DeploymentEventService | process', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns null when repo_full_name is unknown', async ({ assert }) => {
    const payload = {
      repo_full_name: 'unknown/repo',
      environment: 'production',
      status: 'success',
      deployed_at: DateTime.now().toISO(),
    }
    const service = new DeploymentEventService(payload)
    const result = await service.process()
    assert.isNull(result)
  })

  test('creates a deployment record for a known repo', async ({ assert }) => {
    const ts = await seedTechStream()
    await seedRepo(ts.id, 'acme/api')

    const deployedAt = DateTime.now()
    const payload = {
      repo_full_name: 'acme/api',
      environment: 'production',
      status: 'success',
      deployed_at: deployedAt.toISO(),
      commit_sha: 'abc123',
      pipeline_id: 'build-42',
    }

    const service = new DeploymentEventService(payload)
    const result = await service.process()

    assert.isNotNull(result)
    assert.equal(result!.techStreamId, ts.id)
    assert.equal(result!.environment, 'production')
    assert.equal(result!.status, 'success')
    assert.equal(result!.commitSha, 'abc123')
    assert.equal(result!.pipelineId, 'build-42')
  })

  test('links PR cycle and computes lead time when pr_number provided', async ({ assert }) => {
    const ts = await seedTechStream()
    const repo = await seedRepo(ts.id, 'acme/api')

    const openedAt = DateTime.now().minus({ hours: 10 })
    await PrCycle.create({
      repoId: repo.id,
      techStreamId: ts.id,
      prNumber: 42,
      openedAt,
      linkedTicketId: 'BACK-100',
    })

    const deployedAt = DateTime.now()
    const payload = {
      repo_full_name: 'acme/api',
      environment: 'production',
      status: 'success',
      deployed_at: deployedAt.toISO(),
      pr_number: 42,
    }

    const service = new DeploymentEventService(payload)
    const result = await service.process()

    assert.isNotNull(result)
    assert.equal(result!.linkedPrNumber, 42)
    assert.equal(result!.linkedTicketId, 'BACK-100')
    // lead time = hours from PR opened to deployed (≈10 hrs)
    assert.isNotNull(result!.leadTimeHrs)
    assert.approximately(Number(result!.leadTimeHrs), 10, 0.5)
  })

  test('creates record without lead time when pr_number not provided', async ({ assert }) => {
    const ts = await seedTechStream()
    await seedRepo(ts.id, 'acme/api')

    const payload = {
      repo_full_name: 'acme/api',
      environment: 'staging',
      status: 'success',
      deployed_at: DateTime.now().toISO(),
    }

    const service = new DeploymentEventService(payload)
    const result = await service.process()

    assert.isNotNull(result)
    assert.isNull(result!.leadTimeHrs)
    assert.isNull(result!.linkedPrNumber)
  })
})
