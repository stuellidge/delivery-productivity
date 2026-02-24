import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import DeliveryStream from '#models/delivery_stream'
import TechStream from '#models/tech_stream'
import WorkItemCycle from '#models/work_item_cycle'
import DeploymentRecord from '#models/deployment_record'
import DailyStreamMetric from '#models/daily_stream_metric'
import DailyMetricsMaterializationService from '#services/daily_metrics_materialization_service'

// ─── Seed helpers ────────────────────────────────────────────────────────────

async function seedDeliveryStream(name: string) {
  return DeliveryStream.create({ name, displayName: name, isActive: true })
}

async function seedTechStream(name: string) {
  return TechStream.create({
    name,
    displayName: name,
    githubOrg: `org-${name}`,
    githubInstallId: '12345',
    isActive: true,
  })
}

async function seedCycle(deliveryStreamId: number, cycleTimeDays: number, daysAgo = 5) {
  return WorkItemCycle.create({
    ticketId: `T-${Math.random().toString(36).substring(7)}`,
    deliveryStreamId,
    completedAt: DateTime.now().minus({ days: daysAgo }),
    createdAtSource: DateTime.now().minus({ days: daysAgo + 10 }),
    cycleTimeDays,
    leadTimeDays: cycleTimeDays + 2,
    activeTimeDays: cycleTimeDays * 0.3,
    waitTimeDays: cycleTimeDays * 0.7,
    flowEfficiencyPct: 30,
    stageDurations: { dev: cycleTimeDays },
  })
}

async function seedDeploy(
  techStreamId: number,
  causedIncident = false,
  leadTimeHrs: number | null = null,
  daysAgo = 5
) {
  return DeploymentRecord.create({
    techStreamId,
    environment: 'production',
    status: 'success',
    deployedAt: DateTime.now().minus({ days: daysAgo }),
    causedIncident,
    leadTimeHrs,
  })
}

async function getMetric(
  streamType: 'delivery' | 'tech',
  streamId: number,
  metricName: string,
  percentile: number | null = null
) {
  let q = DailyStreamMetric.query()
    .where('stream_type', streamType)
    .where('stream_id', streamId)
    .where('metric_name', metricName)
  if (percentile === null) {
    q = q.whereNull('percentile')
  } else {
    q = q.where('percentile', percentile)
  }
  return q.first()
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.group('DailyMetricsMaterializationService | delivery stream — cycle time', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('writes cycle_time_p50, p85, p95 rows for a delivery stream', async ({ assert }) => {
    const ds = await seedDeliveryStream('dm-ct')
    await seedCycle(ds.id, 2)
    await seedCycle(ds.id, 4)
    await seedCycle(ds.id, 6)

    await new DailyMetricsMaterializationService().run()

    const p50 = await getMetric('delivery', ds.id, 'cycle_time_p50', 50)
    const p85 = await getMetric('delivery', ds.id, 'cycle_time_p85', 85)
    const p95 = await getMetric('delivery', ds.id, 'cycle_time_p95', 95)

    assert.isNotNull(p50)
    assert.isNotNull(p85)
    assert.isNotNull(p95)
    assert.equal(p50!.metricUnit, 'days')
    assert.equal(p50!.sampleSize, 3)
    assert.approximately(Number(p50!.metricValue), 4, 0.5)
  })

  test('does not write cycle_time rows when no completed cycles exist', async ({ assert }) => {
    const ds = await seedDeliveryStream('dm-ct-empty')

    await new DailyMetricsMaterializationService().run()

    const p85 = await getMetric('delivery', ds.id, 'cycle_time_p85', 85)
    assert.isNull(p85)
  })
})

test.group('DailyMetricsMaterializationService | delivery stream — flow efficiency', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('writes flow_efficiency row', async ({ assert }) => {
    const ds = await seedDeliveryStream('dm-fe')
    await WorkItemCycle.create({
      ticketId: 'FE-1',
      deliveryStreamId: ds.id,
      completedAt: DateTime.now().minus({ days: 3 }),
      createdAtSource: DateTime.now().minus({ days: 10 }),
      cycleTimeDays: 8,
      leadTimeDays: 10,
      activeTimeDays: 4,
      waitTimeDays: 4,
      flowEfficiencyPct: 50,
      stageDurations: { dev: 4, dev_queue: 4 },
    })

    await new DailyMetricsMaterializationService().run()

    const row = await getMetric('delivery', ds.id, 'flow_efficiency')
    assert.isNotNull(row)
    assert.equal(row!.metricUnit, 'percent')
    assert.approximately(Number(row!.metricValue), 50, 0.1)
  })
})

test.group('DailyMetricsMaterializationService | delivery stream — WIP', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('writes wip_* rows for each stage present', async ({ assert }) => {
    const ds = await seedDeliveryStream('dm-wip')
    // Seed two work item events so WIP shows dev=1, qa=1
    const { default: WorkItemEvent } = await import('#models/work_item_event')
    await WorkItemEvent.create({
      source: 'jira',
      deliveryStreamId: ds.id,
      eventTimestamp: DateTime.now().minus({ hours: 2 }),
      receivedAt: DateTime.now(),
      eventType: 'transitioned',
      ticketId: 'WIP-1',
      toStage: 'dev',
    })
    await WorkItemEvent.create({
      source: 'jira',
      deliveryStreamId: ds.id,
      eventTimestamp: DateTime.now().minus({ hours: 1 }),
      receivedAt: DateTime.now(),
      eventType: 'transitioned',
      ticketId: 'WIP-2',
      toStage: 'qa',
    })

    await new DailyMetricsMaterializationService().run()

    const wipDev = await getMetric('delivery', ds.id, 'wip_dev')
    const wipQa = await getMetric('delivery', ds.id, 'wip_qa')

    assert.isNotNull(wipDev)
    assert.isNotNull(wipQa)
    assert.equal(wipDev!.metricUnit, 'count')
    assert.equal(Number(wipDev!.metricValue), 1)
    assert.equal(Number(wipQa!.metricValue), 1)
  })
})

test.group('DailyMetricsMaterializationService | tech stream — DORA metrics', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('writes deployment_frequency and change_failure_rate rows', async ({ assert }) => {
    const ts = await seedTechStream('dm-dora')
    await seedDeploy(ts.id, false)
    await seedDeploy(ts.id, false)
    await seedDeploy(ts.id, true) // caused incident

    await new DailyMetricsMaterializationService().run()

    const freq = await getMetric('tech', ts.id, 'deployment_frequency')
    const cfr = await getMetric('tech', ts.id, 'change_failure_rate')

    assert.isNotNull(freq)
    assert.isNotNull(cfr)
    assert.equal(freq!.metricUnit, 'per_week')
    assert.equal(cfr!.metricUnit, 'percent')
    // 3 deploys in 30-day window → 3/(30/7) ≈ 0.7 per week
    assert.isAbove(Number(freq!.metricValue), 0)
    // 1/3 failed → 33.3%
    assert.approximately(Number(cfr!.metricValue), 33.3, 1)
    assert.equal(freq!.sampleSize, 3)
  })

  test('writes ttr_median and ttr_mean rows', async ({ assert }) => {
    const ts = await seedTechStream('dm-ttr')
    const { default: IncidentEvent } = await import('#models/incident_event')
    await IncidentEvent.create({
      eventType: 'alarm_resolved',
      incidentId: 'INC-DM1',
      serviceName: 'api',
      techStreamId: ts.id,
      occurredAt: DateTime.now().minus({ days: 5 }),
      timeToRestoreMin: 30,
    })
    await IncidentEvent.create({
      eventType: 'alarm_resolved',
      incidentId: 'INC-DM2',
      serviceName: 'api',
      techStreamId: ts.id,
      occurredAt: DateTime.now().minus({ days: 4 }),
      timeToRestoreMin: 90,
    })

    await new DailyMetricsMaterializationService().run()

    const median = await getMetric('tech', ts.id, 'ttr_median')
    const mean = await getMetric('tech', ts.id, 'ttr_mean')

    assert.isNotNull(median)
    assert.isNotNull(mean)
    assert.equal(median!.metricUnit, 'minutes')
    assert.approximately(Number(median!.metricValue), 60, 1)
    assert.approximately(Number(mean!.metricValue), 60, 1)
    assert.equal(median!.sampleSize, 2)
  })

  test('writes lead_time_p50 and lead_time_p85 when deploys have lead time', async ({ assert }) => {
    const ts = await seedTechStream('dm-lt')
    await seedDeploy(ts.id, false, 4)
    await seedDeploy(ts.id, false, 8)
    await seedDeploy(ts.id, false, 12)

    await new DailyMetricsMaterializationService().run()

    const p50 = await getMetric('tech', ts.id, 'lead_time_p50', 50)
    const p85 = await getMetric('tech', ts.id, 'lead_time_p85', 85)

    assert.isNotNull(p50)
    assert.isNotNull(p85)
    assert.equal(p50!.metricUnit, 'hours')
    assert.approximately(Number(p50!.metricValue), 8, 0.5)
  })

  test('does not write lead_time rows when no deploys have lead_time_hrs', async ({ assert }) => {
    const ts = await seedTechStream('dm-lt-null')
    await seedDeploy(ts.id, false, null)

    await new DailyMetricsMaterializationService().run()

    const p50 = await getMetric('tech', ts.id, 'lead_time_p50', 50)
    assert.isNull(p50)
  })

  test('writes review_turnaround_p50 and review_turnaround_p85 rows', async ({ assert }) => {
    const ts = await seedTechStream('dm-rt')

    await new DailyMetricsMaterializationService().run()

    const p50 = await getMetric('tech', ts.id, 'review_turnaround_p50', 50)
    const p85 = await getMetric('tech', ts.id, 'review_turnaround_p85', 85)

    // Values will be 0 (no PR data) but rows should exist
    assert.isNotNull(p50)
    assert.isNotNull(p85)
    assert.equal(p50!.metricUnit, 'hours')
  })
})

test.group('DailyMetricsMaterializationService | idempotency', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('running twice updates existing rows without creating duplicates', async ({ assert }) => {
    const ts = await seedTechStream('dm-idem')
    await seedDeploy(ts.id, false)

    const svc = new DailyMetricsMaterializationService()
    await svc.run()
    await svc.run() // second run same day

    const rows = await DailyStreamMetric.query()
      .where('stream_type', 'tech')
      .where('stream_id', ts.id)
      .where('metric_name', 'deployment_frequency')

    assert.equal(rows.length, 1, 'should have exactly one deployment_frequency row')
  })

  test('run() returns the count of rows written today', async ({ assert }) => {
    const ds = await seedDeliveryStream('dm-count')
    const ts = await seedTechStream('dm-count-ts')
    await seedCycle(ds.id, 4)
    await seedDeploy(ts.id, false)

    const count = await new DailyMetricsMaterializationService().run()

    assert.isAbove(count, 0)
  })
})
