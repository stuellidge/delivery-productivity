import { DateTime } from 'luxon'
import PulseResponse from '#models/pulse_response'
import PulseAggregate from '#models/pulse_aggregate'
import DeliveryStream from '#models/delivery_stream'

export default class PulseSurveyAggregationService {
  constructor(
    private readonly deliveryStreamId: number,
    private readonly surveyPeriod: string
  ) {}

  async aggregate(): Promise<PulseAggregate> {
    const responses = await PulseResponse.query()
      .where('delivery_stream_id', this.deliveryStreamId)
      .where('survey_period', this.surveyPeriod)

    const responseCount = responses.length
    const paceAvg = responseCount > 0 ? this.avg(responses.map((r) => r.paceScore)) : null
    const toolingAvg = responseCount > 0 ? this.avg(responses.map((r) => r.toolingScore)) : null
    const clarityAvg = responseCount > 0 ? this.avg(responses.map((r) => r.clarityScore)) : null
    const overallAvg =
      paceAvg !== null && toolingAvg !== null && clarityAvg !== null
        ? (paceAvg + toolingAvg + clarityAvg) / 3
        : null

    const deliveryStream = await DeliveryStream.findOrFail(this.deliveryStreamId)
    const teamSize = deliveryStream.teamSize
    const responseRatePct = teamSize && teamSize > 0 ? (responseCount / teamSize) * 100 : null

    // Compute trends from prior period
    const priorPeriod = this.priorPeriod(this.surveyPeriod)
    const prior = await PulseAggregate.query()
      .where('delivery_stream_id', this.deliveryStreamId)
      .where('survey_period', priorPeriod)
      .first()

    const paceTrend =
      paceAvg !== null && prior?.paceAvg !== null && prior?.paceAvg !== undefined
        ? paceAvg - Number(prior.paceAvg)
        : null
    const toolingTrend =
      toolingAvg !== null && prior?.toolingAvg !== null && prior?.toolingAvg !== undefined
        ? toolingAvg - Number(prior.toolingAvg)
        : null
    const clarityTrend =
      clarityAvg !== null && prior?.clarityAvg !== null && prior?.clarityAvg !== undefined
        ? clarityAvg - Number(prior.clarityAvg)
        : null

    // Upsert
    const existing = await PulseAggregate.query()
      .where('delivery_stream_id', this.deliveryStreamId)
      .where('survey_period', this.surveyPeriod)
      .first()

    if (existing) {
      existing.merge({
        responseCount,
        teamSize,
        responseRatePct,
        paceAvg,
        paceTrend,
        toolingAvg,
        toolingTrend,
        clarityAvg,
        clarityTrend,
        overallAvg,
        computedAt: DateTime.now(),
      })
      await existing.save()
      return existing
    }

    return PulseAggregate.create({
      deliveryStreamId: this.deliveryStreamId,
      surveyPeriod: this.surveyPeriod,
      responseCount,
      teamSize,
      responseRatePct,
      paceAvg,
      paceTrend,
      toolingAvg,
      toolingTrend,
      clarityAvg,
      clarityTrend,
      overallAvg,
      computedAt: DateTime.now(),
    })
  }

  private avg(values: number[]): number {
    return values.reduce((sum, v) => sum + v, 0) / values.length
  }

  private priorPeriod(period: string): string {
    const [year, month] = period.split('-').map(Number)
    const dt = DateTime.fromObject({ year, month })
    const prior = dt.minus({ months: 1 })
    return prior.toFormat('yyyy-MM')
  }
}
