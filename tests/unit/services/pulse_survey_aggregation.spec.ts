import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import DeliveryStream from '#models/delivery_stream'
import PulseResponse from '#models/pulse_response'
import PulseAggregate from '#models/pulse_aggregate'
import PulseSurveyAggregationService from '#services/pulse_survey_aggregation_service'

async function seedDeliveryStream(teamSize: number | null = null) {
  return DeliveryStream.create({
    name: `ds-${Date.now()}`,
    displayName: 'Test Stream',
    isActive: true,
    teamSize,
  })
}

async function seedResponse(
  deliveryStreamId: number,
  respondentHash: string,
  surveyPeriod: string,
  scores: { pace: number; tooling: number; clarity: number }
) {
  return PulseResponse.create({
    source: 'web',
    deliveryStreamId,
    respondentHash,
    surveyPeriod,
    receivedAt: DateTime.now(),
    eventTimestamp: DateTime.now(),
    paceScore: scores.pace,
    toolingScore: scores.tooling,
    clarityScore: scores.clarity,
  })
}

test.group('PulseSurveyAggregationService | aggregate', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('computes averages correctly from responses', async ({ assert }) => {
    const ds = await seedDeliveryStream(10)
    await seedResponse(ds.id, 'user-1', '2026-01', { pace: 4, tooling: 3, clarity: 5 })
    await seedResponse(ds.id, 'user-2', '2026-01', { pace: 2, tooling: 4, clarity: 3 })

    const service = new PulseSurveyAggregationService(ds.id, '2026-01')
    const result = await service.aggregate()

    assert.equal(result.responseCount, 2)
    assert.approximately(result.paceAvg!, 3.0, 0.01)
    assert.approximately(result.toolingAvg!, 3.5, 0.01)
    assert.approximately(result.clarityAvg!, 4.0, 0.01)
    assert.approximately(result.overallAvg!, (3.0 + 3.5 + 4.0) / 3, 0.01)
  })

  test('computes response rate when team size is set', async ({ assert }) => {
    const ds = await seedDeliveryStream(10)
    await seedResponse(ds.id, 'user-1', '2026-02', { pace: 3, tooling: 3, clarity: 3 })
    await seedResponse(ds.id, 'user-2', '2026-02', { pace: 4, tooling: 4, clarity: 4 })
    await seedResponse(ds.id, 'user-3', '2026-02', { pace: 5, tooling: 5, clarity: 5 })
    await seedResponse(ds.id, 'user-4', '2026-02', { pace: 2, tooling: 2, clarity: 2 })

    const service = new PulseSurveyAggregationService(ds.id, '2026-02')
    const result = await service.aggregate()

    // 4 / 10 * 100 = 40%
    assert.approximately(result.responseRatePct!, 40, 0.1)
  })

  test('upserts aggregate — second call updates existing record', async ({ assert }) => {
    const ds = await seedDeliveryStream(5)
    await seedResponse(ds.id, 'user-1', '2026-03', { pace: 3, tooling: 3, clarity: 3 })

    const service = new PulseSurveyAggregationService(ds.id, '2026-03')
    await service.aggregate()

    // Add another response and re-aggregate
    await seedResponse(ds.id, 'user-2', '2026-03', { pace: 5, tooling: 5, clarity: 5 })
    const result = await service.aggregate()

    const count = await PulseAggregate.query()
      .where('delivery_stream_id', ds.id)
      .where('survey_period', '2026-03')
      .count('* as total')

    assert.equal(Number(count[0].$extras.total), 1)
    assert.equal(result.responseCount, 2)
  })

  test('computes trend as difference from previous period', async ({ assert }) => {
    const ds = await seedDeliveryStream(5)

    // Aggregate January first
    await seedResponse(ds.id, 'user-1', '2026-01', { pace: 3, tooling: 3, clarity: 3 })
    const janService = new PulseSurveyAggregationService(ds.id, '2026-01')
    await janService.aggregate()

    // Aggregate February
    await seedResponse(ds.id, 'user-1', '2026-02', { pace: 4, tooling: 4, clarity: 4 })
    const febService = new PulseSurveyAggregationService(ds.id, '2026-02')
    const febResult = await febService.aggregate()

    // Trend = 4 - 3 = +1 for each dimension
    assert.approximately(febResult.paceTrend!, 1.0, 0.01)
    assert.approximately(febResult.toolingTrend!, 1.0, 0.01)
    assert.approximately(febResult.clarityTrend!, 1.0, 0.01)
  })

  test('returns null trends when no prior period exists', async ({ assert }) => {
    const ds = await seedDeliveryStream(5)
    await seedResponse(ds.id, 'user-1', '2026-05', { pace: 4, tooling: 3, clarity: 5 })

    const service = new PulseSurveyAggregationService(ds.id, '2026-05')
    const result = await service.aggregate()

    assert.isNull(result.paceTrend)
    assert.isNull(result.toolingTrend)
    assert.isNull(result.clarityTrend)
  })
})
