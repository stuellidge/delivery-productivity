import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import TechStream from '#models/tech_stream'
import Repository from '#models/repository'
import IncidentEvent from '#models/incident_event'
import IncidentEventService from '#services/incident_event_service'

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

test.group('IncidentEventService | process', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns null when service_name has no matching repo', async ({ assert }) => {
    const payload = {
      event_type: 'alarm_triggered',
      incident_id: 'INC-001',
      service_name: 'unknown-service',
      occurred_at: DateTime.now().toISO(),
    }
    const service = new IncidentEventService(payload)
    const result = await service.process()
    assert.isNull(result)
  })

  test('creates incident event for known service', async ({ assert }) => {
    const ts = await seedTechStream()
    await seedRepo(ts.id, 'api-service')

    const occurredAt = DateTime.now()
    const payload = {
      event_type: 'alarm_triggered',
      incident_id: 'INC-001',
      service_name: 'api-service',
      severity: 'critical',
      description: 'High error rate',
      occurred_at: occurredAt.toISO(),
    }

    const service = new IncidentEventService(payload)
    const result = await service.process()

    assert.isNotNull(result)
    assert.equal(result!.incidentId, 'INC-001')
    assert.equal(result!.eventType, 'alarm_triggered')
    assert.equal(result!.severity, 'critical')
    assert.equal(result!.techStreamId, ts.id)
  })

  test('is idempotent — skips duplicate (incident_id, event_type)', async ({ assert }) => {
    const ts = await seedTechStream()
    await seedRepo(ts.id, 'api-service')

    const payload = {
      event_type: 'alarm_triggered',
      incident_id: 'INC-002',
      service_name: 'api-service',
      occurred_at: DateTime.now().toISO(),
    }

    await new IncidentEventService(payload).process()
    await new IncidentEventService(payload).process() // second call should be skipped

    const count = await IncidentEvent.query()
      .where('incident_id', 'INC-002')
      .where('event_type', 'alarm_triggered')
      .count('* as total')

    assert.equal(Number(count[0].$extras.total), 1)
  })

  test('computes time_to_restore_min when resolved event follows trigger', async ({ assert }) => {
    const ts = await seedTechStream()
    await seedRepo(ts.id, 'api-service')

    const triggeredAt = DateTime.now().minus({ minutes: 45 })
    await IncidentEvent.create({
      eventType: 'alarm_triggered',
      incidentId: 'INC-003',
      serviceName: 'api-service',
      techStreamId: ts.id,
      occurredAt: triggeredAt,
    })

    const resolvedAt = DateTime.now()
    const payload = {
      event_type: 'alarm_resolved',
      incident_id: 'INC-003',
      service_name: 'api-service',
      occurred_at: resolvedAt.toISO(),
    }

    const service = new IncidentEventService(payload)
    const result = await service.process()

    assert.isNotNull(result)
    assert.isNotNull(result!.timeToRestoreMin)
    assert.approximately(result!.timeToRestoreMin!, 45, 2)
    assert.isNotNull(result!.resolvedAt)
  })
})
