import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { DateTime } from 'luxon'
import PulseAggregate from '#models/pulse_aggregate'
import DeliveryStream from '#models/delivery_stream'

/**
 * Seeds pre-computed pulse survey aggregates for the last 4 survey periods.
 * Seeding aggregates directly (rather than raw responses) avoids needing demo
 * users to submit surveys before the chart shows data.
 *
 * Scores use a 1–5 scale: pace (sustainability), tooling (tools/process), clarity (goals).
 * Development environment only — will not run in test or production.
 */
export default class PulseSeeder extends BaseSeeder {
  static environment = ['development']

  async run() {
    const payments = await DeliveryStream.findByOrFail('name', 'payments')
    const search = await DeliveryStream.findByOrFail('name', 'search')

    const now = DateTime.now()
    // Survey periods are YYYY-MM strings, going back 3 months
    const periods = [
      now.minus({ months: 3 }).toFormat('yyyy-MM'),
      now.minus({ months: 2 }).toFormat('yyyy-MM'),
      now.minus({ months: 1 }).toFormat('yyyy-MM'),
      now.toFormat('yyyy-MM'),
    ]

    // Payments: generally healthy team, slight pace concern recently
    const paymentsData = [
      { pace: 3.9, pTrend: null, tooling: 3.6, tTrend: null, clarity: 4.2, cTrend: null, responses: 6, rate: 75.0 },
      { pace: 3.8, pTrend: -0.1, tooling: 3.7, tTrend: 0.1, clarity: 4.1, cTrend: -0.1, responses: 7, rate: 87.5 },
      { pace: 3.6, pTrend: -0.2, tooling: 3.5, tTrend: -0.2, clarity: 4.3, cTrend: 0.2, responses: 6, rate: 75.0 },
      { pace: 3.4, pTrend: -0.2, tooling: 3.4, tTrend: -0.1, clarity: 4.0, cTrend: -0.3, responses: 5, rate: 62.5 },
    ]

    // Search: smaller team, lower tooling, good clarity on priorities
    const searchData = [
      { pace: 4.0, pTrend: null, tooling: 3.2, tTrend: null, clarity: 3.8, cTrend: null, responses: 4, rate: 80.0 },
      { pace: 3.8, pTrend: -0.2, tooling: 3.4, tTrend: 0.2, clarity: 4.0, cTrend: 0.2, responses: 4, rate: 80.0 },
      { pace: 3.9, pTrend: 0.1, tooling: 3.3, tTrend: -0.1, clarity: 4.2, cTrend: 0.2, responses: 3, rate: 60.0 },
      { pace: 3.7, pTrend: -0.2, tooling: 3.5, tTrend: 0.2, clarity: 4.1, cTrend: -0.1, responses: 4, rate: 80.0 },
    ]

    const computedAt = now

    for (let i = 0; i < periods.length; i++) {
      const period = periods[i]

      const pd = paymentsData[i]
      const paymentsOverall = (pd.pace + pd.tooling + pd.clarity) / 3
      await PulseAggregate.updateOrCreate(
        { deliveryStreamId: payments.id, surveyPeriod: period },
        {
          deliveryStreamId: payments.id,
          surveyPeriod: period,
          responseCount: pd.responses,
          teamSize: 8,
          responseRatePct: pd.rate,
          paceAvg: pd.pace,
          paceTrend: pd.pTrend,
          toolingAvg: pd.tooling,
          toolingTrend: pd.tTrend,
          clarityAvg: pd.clarity,
          clarityTrend: pd.cTrend,
          overallAvg: Math.round(paymentsOverall * 100) / 100,
          computedAt,
        }
      )

      const sd = searchData[i]
      const searchOverall = (sd.pace + sd.tooling + sd.clarity) / 3
      await PulseAggregate.updateOrCreate(
        { deliveryStreamId: search.id, surveyPeriod: period },
        {
          deliveryStreamId: search.id,
          surveyPeriod: period,
          responseCount: sd.responses,
          teamSize: 5,
          responseRatePct: sd.rate,
          paceAvg: sd.pace,
          paceTrend: sd.pTrend,
          toolingAvg: sd.tooling,
          toolingTrend: sd.tTrend,
          clarityAvg: sd.clarity,
          clarityTrend: sd.cTrend,
          overallAvg: Math.round(searchOverall * 100) / 100,
          computedAt,
        }
      )
    }
  }
}
