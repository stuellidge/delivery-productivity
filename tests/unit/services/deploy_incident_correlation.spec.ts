import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import TechStream from '#models/tech_stream'
import DeploymentRecord from '#models/deployment_record'
import IncidentEvent from '#models/incident_event'
import DeployIncidentCorrelationService from '#services/deploy_incident_correlation_service'

async function seedTechStream() {
  return TechStream.create({
    name: 'backend',
    displayName: 'Backend',
    githubOrg: 'acme',
    githubInstallId: '11111',
    isActive: true,
  })
}

async function seedDeployment(
  techStreamId: number,
  environment: string,
  deployedAt: DateTime,
  status: 'success' | 'failed' | 'rolled_back' | 'cancelled' = 'success'
) {
  return DeploymentRecord.create({
    techStreamId,
    environment,
    status,
    deployedAt,
  })
}

async function seedIncident(
  techStreamId: number,
  incidentId: string,
  eventType: 'alarm_triggered' | 'alarm_resolved' | 'incident_opened' | 'incident_resolved',
  occurredAt: DateTime
) {
  return IncidentEvent.create({
    eventType,
    incidentId,
    serviceName: 'api-service',
    techStreamId,
    occurredAt,
  })
}

test.group('DeployIncidentCorrelationService | onDeploy', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('sets caused_incident when incident within 60min after deploy', async ({ assert }) => {
    const ts = await seedTechStream()
    const deployedAt = DateTime.now().minus({ minutes: 30 })
    const deploy = await seedDeployment(ts.id, 'production', deployedAt)

    await seedIncident(ts.id, 'INC-001', 'alarm_triggered', deployedAt.plus({ minutes: 20 }))

    const service = new DeployIncidentCorrelationService()
    await service.onDeploy(deploy)

    await deploy.refresh()
    assert.isTrue(deploy.causedIncident)
    assert.equal(deploy.incidentId, 'INC-001')
  })

  test('does not set caused_incident when no incident within window', async ({ assert }) => {
    const ts = await seedTechStream()
    const deployedAt = DateTime.now().minus({ minutes: 120 })
    const deploy = await seedDeployment(ts.id, 'production', deployedAt)

    // Incident 90 min after deploy — outside 60 min window
    await seedIncident(ts.id, 'INC-002', 'alarm_triggered', deployedAt.plus({ minutes: 90 }))

    const service = new DeployIncidentCorrelationService()
    await service.onDeploy(deploy)

    await deploy.refresh()
    assert.isFalse(deploy.causedIncident)
  })

  test('ignores non-production deployments', async ({ assert }) => {
    const ts = await seedTechStream()
    const deployedAt = DateTime.now()
    const deploy = await seedDeployment(ts.id, 'staging', deployedAt)

    await seedIncident(ts.id, 'INC-003', 'alarm_triggered', deployedAt.plus({ minutes: 5 }))

    const service = new DeployIncidentCorrelationService()
    await service.onDeploy(deploy)

    await deploy.refresh()
    assert.isFalse(deploy.causedIncident)
  })
})

test.group('DeployIncidentCorrelationService | onIncidentResolved', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('links resolved incident to prior production deploy', async ({ assert }) => {
    const ts = await seedTechStream()
    const deployedAt = DateTime.now().minus({ minutes: 45 })
    const deploy = await seedDeployment(ts.id, 'production', deployedAt)

    const incident = await seedIncident(ts.id, 'INC-004', 'incident_resolved', DateTime.now())

    const service = new DeployIncidentCorrelationService()
    await service.onIncidentResolved(incident)

    await deploy.refresh()
    assert.isTrue(deploy.causedIncident)
    assert.equal(deploy.incidentId, 'INC-004')

    await incident.refresh()
    assert.equal(incident.relatedDeployId, deploy.id)
  })

  test('does not link when no deploy within 60min window', async ({ assert }) => {
    const ts = await seedTechStream()
    // Deploy happened 2 hours before incident — outside window
    const deployedAt = DateTime.now().minus({ minutes: 120 })
    const deploy = await seedDeployment(ts.id, 'production', deployedAt)

    const incident = await seedIncident(ts.id, 'INC-005', 'incident_resolved', DateTime.now())

    const service = new DeployIncidentCorrelationService()
    await service.onIncidentResolved(incident)

    await deploy.refresh()
    assert.isFalse(deploy.causedIncident)

    await incident.refresh()
    assert.isNull(incident.relatedDeployId)
  })
})
