import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { createHash } from 'node:crypto'
import { DateTime } from 'luxon'
import ApiKey from '#models/api_key'
import TechStream from '#models/tech_stream'
import Repository from '#models/repository'
import IncidentEvent from '#models/incident_event'

const RAW_KEY = 'test-incident-api-key'
const KEY_HASH = createHash('sha256').update(RAW_KEY).digest('hex')

async function seedApiKey() {
  return ApiKey.create({
    keyHash: KEY_HASH,
    displayName: 'Test Incident Key',
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

async function seedRepo(techStreamId: number, deployTarget = 'api-service') {
  return Repository.create({
    techStreamId,
    githubOrg: 'acme',
    githubRepoName: 'api',
    fullName: 'acme/api',
    defaultBranch: 'main',
    isDeployable: true,
    deployTarget,
    isActive: true,
  })
}

test.group('API | POST /api/v1/events/incident', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns 401 without API key', async ({ client }) => {
    const response = await client.post('/api/v1/events/incident').json({
      event_type: 'alarm_triggered',
      incident_id: 'INC-001',
      service_name: 'api-service',
      occurred_at: DateTime.now().toISO(),
    })
    response.assertStatus(401)
  })

  test('creates incident event for known service', async ({ client, assert }) => {
    await seedApiKey()
    const ts = await seedTechStream()
    await seedRepo(ts.id, 'api-service')

    const response = await client
      .post('/api/v1/events/incident')
      .header('Authorization', `Bearer ${RAW_KEY}`)
      .json({
        event_type: 'alarm_triggered',
        incident_id: 'INC-TEST-001',
        service_name: 'api-service',
        severity: 'critical',
        occurred_at: DateTime.now().toISO(),
      })

    response.assertStatus(202)
    assert.equal(response.body().ok, true)

    const incident = await IncidentEvent.findBy('incident_id', 'INC-TEST-001')
    assert.isNotNull(incident)
    assert.equal(incident!.severity, 'critical')
  })

  test('returns 202 (ignores) for unknown service', async ({ client, assert }) => {
    await seedApiKey()

    const response = await client
      .post('/api/v1/events/incident')
      .header('Authorization', `Bearer ${RAW_KEY}`)
      .json({
        event_type: 'alarm_triggered',
        incident_id: 'INC-UNKNOWN-001',
        service_name: 'unknown-service',
        occurred_at: DateTime.now().toISO(),
      })

    response.assertStatus(202)
    assert.equal(response.body().ok, true)
  })
})
