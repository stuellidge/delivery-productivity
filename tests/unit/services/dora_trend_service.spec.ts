import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import TechStream from '#models/tech_stream'
import DeploymentRecord from '#models/deployment_record'
import IncidentEvent from '#models/incident_event'
import DailyStreamMetric from '#models/daily_stream_metric'
import DoraTrendService from '#services/dora_trend_service'

async function seedTechStream(name: string) {
  return TechStream.create({
    name,
    displayName: name,
    githubOrg: `org-${name}`,
    githubInstallId: '55555',
    isActive: true,
  })
}

async function seedDeploy(
  techStreamId: number,
  deployedAt: DateTime,
  causedIncident = false,
  leadTimeHrs: number | null = null
) {
  return DeploymentRecord.create({
    techStreamId,
    environment: 'production',
    status: 'success',
    deployedAt,
    causedIncident,
    leadTimeHrs,
  })
}

async function seedIncident(
  techStreamId: number,
  incidentId: string,
  occurredAt: DateTime,
  timeToRestoreMin: number | null
) {
  return IncidentEvent.create({
    eventType: 'alarm_triggered',
    incidentId,
    serviceName: 'api',
    techStreamId,
    occurredAt,
    timeToRestoreMin,
  })
}

test.group('DoraTrendService | bucket structure', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns an array of DoraTrendPoint objects', async ({ assert }) => {
    const ts = await seedTechStream('trend-struct')
    const result = await new DoraTrendService(ts.id, 28).compute()
    assert.isArray(result)
    assert.isAtLeast(result.length, 1)
    for (const point of result) {
      assert.property(point, 'weekStart')
      assert.property(point, 'deploymentFrequency')
      assert.property(point, 'changeFailureRate')
      assert.property(point, 'ttrMedian')
      assert.property(point, 'leadTimeP50')
      assert.property(point, 'leadTimeP85')
    }
  })

  test('weekStart values are valid YYYY-MM-DD strings in ascending order', async ({ assert }) => {
    const ts = await seedTechStream('trend-dates')
    const result = await new DoraTrendService(ts.id, 28).compute()
    for (const point of result) {
      assert.match(point.weekStart, /^\d{4}-\d{2}-\d{2}$/)
    }
    for (let i = 1; i < result.length; i++) {
      const prev = DateTime.fromISO(result[i - 1].weekStart)
      const curr = DateTime.fromISO(result[i].weekStart)
      assert.isTrue(curr.toMillis() > prev.toMillis())
    }
  })
})

test.group('DoraTrendService | deployment frequency', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('counts deploys in the correct week bucket', async ({ assert }) => {
    const ts = await seedTechStream('trend-df')
    const now = DateTime.now()
    await seedDeploy(ts.id, now.minus({ days: 8 }))
    await seedDeploy(ts.id, now.minus({ days: 9 }))

    const result = await new DoraTrendService(ts.id, 14).compute()
    const weekWith2 = result.find((p) => p.deploymentFrequency === 2)
    assert.exists(weekWith2)
  })

  test('returns 0 deploymentFrequency when no deploys', async ({ assert }) => {
    const ts = await seedTechStream('trend-df-zero')
    const result = await new DoraTrendService(ts.id, 14).compute()
    for (const point of result) {
      assert.equal(point.deploymentFrequency, 0)
    }
  })

  test('excludes config-only deployment from trend bucket frequency', async ({ assert }) => {
    const ts = await seedTechStream('trend-config-excl')
    const now = DateTime.now()
    await DeploymentRecord.create({
      techStreamId: ts.id,
      environment: 'production',
      status: 'success',
      deployedAt: now.minus({ days: 8 }),
      causedIncident: false,
      triggerType: 'config',
    })

    const result = await new DoraTrendService(ts.id, 14).compute()
    for (const point of result) {
      assert.equal(point.deploymentFrequency, 0)
    }
  })
})

test.group('DoraTrendService | change failure rate', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('computes CFR as percentage of deploys that caused incidents', async ({ assert }) => {
    const ts = await seedTechStream('trend-cfr')
    const now = DateTime.now()
    // All 4 deploys clearly within the first of 2 weekly buckets (window=14d → buckets: [14d, 7d), [7d, now))
    const bucketStart = now.minus({ days: 13 })
    await seedDeploy(ts.id, bucketStart, true)
    await seedDeploy(ts.id, bucketStart.plus({ days: 1 }), false)
    await seedDeploy(ts.id, bucketStart.plus({ days: 2 }), false)
    await seedDeploy(ts.id, bucketStart.plus({ days: 3 }), false)

    const result = await new DoraTrendService(ts.id, 14).compute()
    const cfrWeek = result.find((p) => p.changeFailureRate > 0)
    assert.exists(cfrWeek)
    assert.approximately(cfrWeek!.changeFailureRate, 25, 1)
  })
})

test.group('DoraTrendService | TTR median', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('computes TTR median for incidents in each week bucket', async ({ assert }) => {
    const ts = await seedTechStream('trend-ttr')
    const now = DateTime.now()
    await seedIncident(ts.id, 'INC-T1', now.minus({ days: 8 }), 30)
    await seedIncident(ts.id, 'INC-T2', now.minus({ days: 9 }), 90)

    const result = await new DoraTrendService(ts.id, 14).compute()
    const ttrWeek = result.find((p) => p.ttrMedian > 0)
    assert.exists(ttrWeek)
    assert.approximately(ttrWeek!.ttrMedian, 60, 5)
  })

  test('returns 0 ttrMedian when no incidents', async ({ assert }) => {
    const ts = await seedTechStream('trend-ttr-zero')
    const result = await new DoraTrendService(ts.id, 7).compute()
    for (const point of result) {
      assert.equal(point.ttrMedian, 0)
    }
  })
})

test.group('DoraTrendService | lead time', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('computes lead time p50 and p85 when deploys have lead_time_hrs', async ({ assert }) => {
    const ts = await seedTechStream('trend-lt')
    const now = DateTime.now()
    await seedDeploy(ts.id, now.minus({ days: 8 }), false, 4)
    await seedDeploy(ts.id, now.minus({ days: 9 }), false, 8)
    await seedDeploy(ts.id, now.minus({ days: 10 }), false, 12)

    const result = await new DoraTrendService(ts.id, 14).compute()
    const ltWeek = result.find((p) => p.leadTimeP50 !== null)
    assert.exists(ltWeek)
    assert.isNotNull(ltWeek!.leadTimeP50)
    assert.isNotNull(ltWeek!.leadTimeP85)
  })

  test('returns null leadTimeP50 when no deploys have lead_time_hrs', async ({ assert }) => {
    const ts = await seedTechStream('trend-lt-null')
    await seedDeploy(ts.id, DateTime.now().minus({ days: 8 }), false, null)

    const result = await new DoraTrendService(ts.id, 14).compute()
    for (const point of result) {
      assert.isNull(point.leadTimeP50)
      assert.isNull(point.leadTimeP85)
    }
  })
})

test.group('DoraTrendService | materialized path', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  async function seedMetric(
    techStreamId: number,
    metricName: string,
    value: number,
    date: string,
    percentile: number | null = null
  ) {
    return DailyStreamMetric.create({
      metricDate: date,
      streamType: 'tech',
      streamId: techStreamId,
      metricName,
      metricValue: value,
      metricUnit: 'units',
      percentile,
      sampleSize: 1,
    })
  }

  test('compute() uses materialized data when rows exist', async ({ assert }) => {
    const ts = await seedTechStream('trend-mat')
    const today = DateTime.now().toISODate()!
    const yesterday = DateTime.now().minus({ days: 1 }).toISODate()!

    await seedMetric(ts.id, 'deployment_frequency', 3, today)
    await seedMetric(ts.id, 'change_failure_rate', 25, today)
    await seedMetric(ts.id, 'ttr_median', 45, today)
    await seedMetric(ts.id, 'lead_time_p50', 12, today, 50)
    await seedMetric(ts.id, 'lead_time_p85', 20, today, 85)

    await seedMetric(ts.id, 'deployment_frequency', 2, yesterday)
    await seedMetric(ts.id, 'change_failure_rate', 0, yesterday)
    await seedMetric(ts.id, 'ttr_median', 0, yesterday)
    await seedMetric(ts.id, 'lead_time_p50', 10, yesterday, 50)
    await seedMetric(ts.id, 'lead_time_p85', 18, yesterday, 85)

    const result = await new DoraTrendService(ts.id, 7).compute()

    assert.isArray(result)
    assert.isAtLeast(result.length, 2)

    // Points come from materialized table (daily), ordered ascending
    for (let i = 1; i < result.length; i++) {
      const prev = DateTime.fromISO(result[i - 1].weekStart)
      const curr = DateTime.fromISO(result[i].weekStart)
      assert.isTrue(curr.toMillis() >= prev.toMillis())
    }

    const todayPoint = result.find((p) => p.weekStart === today)
    assert.exists(todayPoint)
    assert.equal(todayPoint!.deploymentFrequency, 3)
    assert.equal(todayPoint!.changeFailureRate, 25)
    assert.equal(todayPoint!.ttrMedian, 45)
    assert.equal(todayPoint!.leadTimeP50, 12)
    assert.equal(todayPoint!.leadTimeP85, 20)
  })

  test('falls back to raw computation when no materialized data exists', async ({ assert }) => {
    const ts = await seedTechStream('trend-mat-fallback')
    // Seed raw data only — no daily_stream_metrics rows
    await seedDeploy(ts.id, DateTime.now().minus({ days: 8 }))

    const result = await new DoraTrendService(ts.id, 14).compute()

    assert.isArray(result)
    assert.isAtLeast(result.length, 1)
    const weekWithDeploy = result.find((p) => p.deploymentFrequency > 0)
    assert.exists(weekWithDeploy)
  })
})
