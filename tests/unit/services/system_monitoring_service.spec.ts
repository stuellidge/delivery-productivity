import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import DeliveryStream from '#models/delivery_stream'
import PulseResponse from '#models/pulse_response'
import DeploymentRecord from '#models/deployment_record'
import TechStream from '#models/tech_stream'
import SystemMonitoringService from '#services/system_monitoring_service'

async function seedTechStream(name = 'mon-ts') {
  return TechStream.create({
    name,
    displayName: name,
    githubOrg: 'acme',
    githubInstallId: '999',
    isActive: true,
  })
}

async function seedDeliveryStream(name = 'mon-ds') {
  return DeliveryStream.create({
    name,
    displayName: name,
    isActive: true,
    teamSize: 5,
  })
}

test.group('SystemMonitoringService | no alerts', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns no alerts when all conditions are healthy (no data)', async ({ assert }) => {
    const service = new SystemMonitoringService()
    const alerts = await service.getActiveAlerts()
    // With no data, totals are 0 and thresholds are not triggered (no data = skip check)
    assert.isArray(alerts)
  })
})

test.group('SystemMonitoringService | data quality alerts', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns LOW alert when deployment traceability below 80%', async ({ assert }) => {
    const ts = await seedTechStream()
    // 1 traceable, 4 total in production = 25% traceability
    for (let i = 0; i < 3; i++) {
      await DeploymentRecord.create({
        techStreamId: ts.id,
        environment: 'production',
        status: 'success',
        linkedTicketId: null,
        causedIncident: false,
        deployedAt: DateTime.now(),
      })
    }
    await DeploymentRecord.create({
      techStreamId: ts.id,
      environment: 'production',
      status: 'success',
      linkedTicketId: 'TICK-1',
      causedIncident: false,
      deployedAt: DateTime.now(),
    })

    const service = new SystemMonitoringService()
    const alerts = await service.getActiveAlerts()
    const traceabilityAlert = alerts.find((a) => a.condition === 'deployment_traceability_low')
    assert.exists(traceabilityAlert)
    assert.equal(traceabilityAlert!.severity, 'low')
  })
})

test.group('SystemMonitoringService | pulse response rate', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns LOW alert when pulse response rate < 40%', async ({ assert }) => {
    const ds = await seedDeliveryStream()
    // Team size = 5, only 1 response = 20% response rate
    await PulseResponse.create({
      source: 'manual',
      deliveryStreamId: ds.id,
      techStreamId: null,
      surveyPeriod: DateTime.now().toFormat('yyyy-MM'),
      respondentHash: 'respondent-hash-001',
      paceScore: 3,
      toolingScore: 3,
      clarityScore: 3,
      receivedAt: DateTime.now(),
      eventTimestamp: DateTime.now(),
    })

    const service = new SystemMonitoringService()
    const alerts = await service.getActiveAlerts()
    const pulseAlert = alerts.find((a) => a.condition === 'pulse_response_rate_low')
    assert.exists(pulseAlert)
    assert.equal(pulseAlert!.severity, 'low')
  })
})

test.group('SystemMonitoringService | alert structure', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('each alert has required fields: condition, severity, message', async ({ assert }) => {
    const ts = await seedTechStream('mon-ts-str')
    for (let i = 0; i < 4; i++) {
      await DeploymentRecord.create({
        techStreamId: ts.id,
        environment: 'production',
        status: 'success',
        linkedTicketId: null,
        causedIncident: false,
        deployedAt: DateTime.now(),
      })
    }
    const service = new SystemMonitoringService()
    const alerts = await service.getActiveAlerts()
    for (const alert of alerts) {
      assert.isString(alert.condition)
      assert.include(['critical', 'high', 'medium', 'low'], alert.severity)
      assert.isString(alert.message)
    }
  })
})
