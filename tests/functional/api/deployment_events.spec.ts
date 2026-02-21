import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { createHash } from 'node:crypto'
import { DateTime } from 'luxon'
import ApiKey from '#models/api_key'
import TechStream from '#models/tech_stream'
import Repository from '#models/repository'
import DeploymentRecord from '#models/deployment_record'

const RAW_KEY = 'test-deployment-api-key'
const KEY_HASH = createHash('sha256').update(RAW_KEY).digest('hex')

async function seedApiKey() {
  return ApiKey.create({
    keyHash: KEY_HASH,
    displayName: 'Test Deployment Key',
    permissions: [],
    isActive: true,
  })
}

async function seedTechStream() {
  return TechStream.create({
    name: 'backend',
    displayName: 'Backend',
    githubOrg: 'acme',
    githubInstallId: '11111',
    isActive: true,
  })
}

async function seedRepo(techStreamId: number) {
  return Repository.create({
    techStreamId,
    githubOrg: 'acme',
    githubRepoName: 'api',
    fullName: 'acme/api',
    defaultBranch: 'main',
    isDeployable: true,
    isActive: true,
  })
}

test.group('API | POST /api/v1/events/deployment', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns 401 without API key', async ({ client }) => {
    const response = await client.post('/api/v1/events/deployment').json({
      repo_full_name: 'acme/api',
      environment: 'production',
      status: 'success',
      deployed_at: DateTime.now().toISO(),
    })
    response.assertStatus(401)
  })

  test('returns ok and creates deployment record for known repo', async ({ client, assert }) => {
    await seedApiKey()
    const ts = await seedTechStream()
    await seedRepo(ts.id)

    const response = await client
      .post('/api/v1/events/deployment')
      .header('Authorization', `Bearer ${RAW_KEY}`)
      .json({
        repo_full_name: 'acme/api',
        environment: 'production',
        status: 'success',
        deployed_at: DateTime.now().toISO(),
        commit_sha: 'deadbeef',
      })

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.ok, true)

    const record = await DeploymentRecord.findBy('commit_sha', 'deadbeef')
    assert.isNotNull(record)
    assert.equal(record!.environment, 'production')
  })

  test('returns ok (ignores) for unknown repo', async ({ client, assert }) => {
    await seedApiKey()

    const response = await client
      .post('/api/v1/events/deployment')
      .header('Authorization', `Bearer ${RAW_KEY}`)
      .json({
        repo_full_name: 'unknown/repo',
        environment: 'production',
        status: 'success',
        deployed_at: DateTime.now().toISO(),
      })

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.ok, true)
  })
})
