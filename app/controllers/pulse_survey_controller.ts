import { createHmac } from 'node:crypto'
import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import DeliveryStream from '#models/delivery_stream'
import PulseResponse from '#models/pulse_response'
import { pulseSurveyValidator } from '#validators/pulse_survey_validator'
import EventArchiveService from '#services/event_archive_service'
import env from '#start/env'

export default class PulseSurveyController {
  async show({ view }: HttpContext) {
    const deliveryStreams = await DeliveryStream.query().where('is_active', true).orderBy('name')
    const surveyPeriod = DateTime.now().toFormat('yyyy-MM')
    return view.render('survey/show', { deliveryStreams, surveyPeriod })
  }

  async submit({ request, response, auth, session }: HttpContext) {
    const user = auth.use('web').user!
    const data = await request.validateUsing(pulseSurveyValidator)

    const surveyPeriod = DateTime.now().toFormat('yyyy-MM')
    const respondentHash = createHmac('sha256', env.get('APP_KEY'))
      .update(String(user.id))
      .digest('hex')

    const now = DateTime.now()
    let pulseRecord: PulseResponse

    // Upsert — unique on (survey_period, respondent_hash, delivery_stream_id)
    const existing = await PulseResponse.query()
      .where('survey_period', surveyPeriod)
      .where('respondent_hash', respondentHash)
      .where('delivery_stream_id', data.delivery_stream_id)
      .first()

    if (existing) {
      existing.merge({
        paceScore: data.pace_score,
        toolingScore: data.tooling_score,
        clarityScore: data.clarity_score,
        freeText: data.free_text ?? null,
        receivedAt: now,
        eventTimestamp: now,
      })
      await existing.save()
      pulseRecord = existing
    } else {
      pulseRecord = await PulseResponse.create({
        source: 'web',
        deliveryStreamId: data.delivery_stream_id,
        surveyPeriod,
        respondentHash,
        paceScore: data.pace_score,
        toolingScore: data.tooling_score,
        clarityScore: data.clarity_score,
        freeText: data.free_text ?? null,
        receivedAt: now,
        eventTimestamp: now,
      })
    }

    await new EventArchiveService().append('pulse_responses', pulseRecord.serialize())

    session.flash('success', 'Thank you for your feedback!')
    return response.redirect().toRoute('survey.show')
  }
}
