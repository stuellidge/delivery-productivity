import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import CrossStreamCorrelation from '#models/cross_stream_correlation'
import DeliveryStream from '#models/delivery_stream'
import TechStream from '#models/tech_stream'
import CrossStreamCorrelationService from '#services/cross_stream_correlation_service'

export default class CrossStreamController {
  async index({ view }: HttpContext) {
    const today = DateTime.now().toISODate()!

    let correlations = await CrossStreamCorrelation.query()
      .where('analysis_date', today)
      .preload('techStream')
      .orderBy('block_count_14d', 'desc')

    const [deliveryStreams, techStreams] = await Promise.all([
      DeliveryStream.query().where('is_active', true).orderBy('name'),
      TechStream.query().where('is_active', true).orderBy('name'),
    ])

    // Fall back to live computation if table not yet populated today
    let liveCorrelations: Array<{
      techStreamId: number
      blockCount14d: number
      impactedDeliveryStreamIds: number[]
      severity: string
      avgConfidencePct: number | null
    }> = []

    if (correlations.length === 0 && techStreams.length > 0) {
      liveCorrelations = await new CrossStreamCorrelationService().computeAll()
    }

    return view.render('cross_stream/index', {
      correlations,
      liveCorrelations,
      deliveryStreams,
      techStreams,
    })
  }
}
