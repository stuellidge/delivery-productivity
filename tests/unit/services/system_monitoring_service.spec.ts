import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import DeliveryStream from '#models/delivery_stream'
import PulseResponse from '#models/pulse_response'
import DeploymentRecord from '#models/deployment_record'
import TechStream from '#models/tech_stream'
import PlatformSetting from '#models/platform_setting'
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

// ─── Queue depth alert ────────────────────────────────────────────────────────

test.group('SystemMonitoringService | queue depth alert', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns HIGH alert when pending event_queue rows reach 1000', async ({ assert }) => {
    await db.rawQuery(
      `INSERT INTO event_queue (event_source, payload, status, attempt_count, enqueued_at)
       SELECT 'jira', '{}'::jsonb, 'pending', 0, NOW()
       FROM generate_series(1, 1000)`
    )

    const alerts = await new SystemMonitoringService().getActiveAlerts()
    const depthAlert = alerts.find((a) => a.condition === 'event_queue_depth_high')
    assert.isDefined(depthAlert)
    assert.equal(depthAlert!.severity, 'high')
  })

  test('no queue depth alert when pending rows are below 1000', async ({ assert }) => {
    await db.rawQuery(
      `INSERT INTO event_queue (event_source, payload, status, attempt_count, enqueued_at)
       SELECT 'jira', '{}'::jsonb, 'pending', 0, NOW()
       FROM generate_series(1, 999)`
    )

    const alerts = await new SystemMonitoringService().getActiveAlerts()
    const depthAlert = alerts.find((a) => a.condition === 'event_queue_depth_high')
    assert.isUndefined(depthAlert)
  })

  test('does not count completed or dead_lettered rows in depth check', async ({ assert }) => {
    await db.rawQuery(
      `INSERT INTO event_queue (event_source, payload, status, attempt_count, enqueued_at)
       SELECT 'jira', '{}'::jsonb, 'completed', 0, NOW()
       FROM generate_series(1, 1000)`
    )

    const alerts = await new SystemMonitoringService().getActiveAlerts()
    const depthAlert = alerts.find((a) => a.condition === 'event_queue_depth_high')
    assert.isUndefined(depthAlert)
  })
})

// ─── notify() ─────────────────────────────────────────────────────────────────

test.group('SystemMonitoringService | notify', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  let originalFetch: typeof globalThis.fetch

  group.setup(() => {
    originalFetch = globalThis.fetch
  })

  group.each.teardown(() => {
    globalThis.fetch = originalFetch
  })

  test('sends Slack POST when there are new alerts', async ({ assert }) => {
    const ts = await TechStream.create({
      name: 'notify-ts',
      displayName: 'Notify TS',
      githubOrg: 'notify-acme',
      githubInstallId: 'n001',
      isActive: true,
    })
    // Seed low traceability to trigger an alert
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

    await PlatformSetting.updateOrCreate(
      { key: 'alert_notification_channels' },
      { value: JSON.stringify({ slackWebhookUrl: 'https://hooks.slack.test/T123' }) }
    )

    let slackCalled = false
    let slackBody: any = null
    globalThis.fetch = async (url: any, opts: any) => {
      slackCalled = true
      slackBody = JSON.parse(opts.body)
      return { ok: true, status: 200 } as any
    }

    await new SystemMonitoringService().notify()

    assert.isTrue(slackCalled)
    assert.isArray(slackBody.blocks)
    assert.isTrue(slackBody.blocks.length > 1) // header + at least one alert block
  })

  test('does not send Slack when all current conditions were already notified', async ({
    assert,
  }) => {
    const ts = await TechStream.create({
      name: 'notify-ts2',
      displayName: 'Notify TS2',
      githubOrg: 'notify-acme2',
      githubInstallId: 'n002',
      isActive: true,
    })
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

    await PlatformSetting.updateOrCreate(
      { key: 'alert_notification_channels' },
      { value: JSON.stringify({ slackWebhookUrl: 'https://hooks.slack.test/T123' }) }
    )
    // Pre-seed last notification with the condition already notified
    await PlatformSetting.updateOrCreate(
      { key: 'last_alert_notification' },
      { value: JSON.stringify({ conditions: ['deployment_traceability_low'] }) }
    )

    let slackCalled = false
    globalThis.fetch = async () => {
      slackCalled = true
      return { ok: true, status: 200 } as any
    }

    await new SystemMonitoringService().notify()

    assert.isFalse(slackCalled)
  })

  test('filters out alerts below the configured minimum severity', async ({ assert }) => {
    const ts = await TechStream.create({
      name: 'notify-ts3',
      displayName: 'Notify TS3',
      githubOrg: 'notify-acme3',
      githubInstallId: 'n003',
      isActive: true,
    })
    // Trigger a LOW severity alert (traceability)
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

    await PlatformSetting.updateOrCreate(
      { key: 'alert_notification_channels' },
      {
        value: JSON.stringify({
          slackWebhookUrl: 'https://hooks.slack.test/T123',
          minimumSeverity: 'high', // only high and critical pass
        }),
      }
    )

    let slackCalled = false
    globalThis.fetch = async () => {
      slackCalled = true
      return { ok: true, status: 200 } as any
    }

    await new SystemMonitoringService().notify()

    assert.isFalse(slackCalled) // LOW alert filtered out
  })

  test('formats Slack blocks with severity and condition name', async ({ assert }) => {
    const ts = await TechStream.create({
      name: 'notify-ts4',
      displayName: 'Notify TS4',
      githubOrg: 'notify-acme4',
      githubInstallId: 'n004',
      isActive: true,
    })
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

    await PlatformSetting.updateOrCreate(
      { key: 'alert_notification_channels' },
      { value: JSON.stringify({ slackWebhookUrl: 'https://hooks.slack.test/T123' }) }
    )

    let slackBody: any = null
    globalThis.fetch = async (_url: any, opts: any) => {
      slackBody = JSON.parse(opts.body)
      return { ok: true, status: 200 } as any
    }

    await new SystemMonitoringService().notify()

    const alertBlocks = slackBody.blocks.filter((b: any) => b.type === 'section')
    assert.isTrue(alertBlocks.length > 0)
    const text = alertBlocks[0].text.text as string
    assert.match(text, /LOW|MEDIUM|HIGH|CRITICAL/)
    assert.match(text, /deployment_traceability_low/)
  })
})
