import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import DeliveryStream from '#models/delivery_stream'
import TechStream from '#models/tech_stream'
import Sprint from '#models/sprint'

export default class ApiStreamsController {
  async delivery({ response }: HttpContext) {
    const streams = await DeliveryStream.query()
      .where('is_active', true)
      .orderBy('display_name', 'asc')

    return response.ok({
      status: 'ok',
      data: streams.map((s) => ({
        id: s.id,
        name: s.name,
        displayName: s.displayName,
        description: s.description,
      })),
      meta: { computed_at: DateTime.now().toISO() },
    })
  }

  async tech({ response }: HttpContext) {
    const streams = await TechStream.query().where('is_active', true).orderBy('display_name', 'asc')

    return response.ok({
      status: 'ok',
      data: streams.map((s) => ({
        id: s.id,
        name: s.name,
        displayName: s.displayName,
        githubOrg: s.githubOrg,
      })),
      meta: { computed_at: DateTime.now().toISO() },
    })
  }

  async sprints({ request, response }: HttpContext) {
    const streamId = request.input('stream') ? Number(request.input('stream')) : undefined
    const state = request.input('state')

    let query = Sprint.query().orderBy('start_date', 'desc')
    if (streamId) query = query.where('delivery_stream_id', streamId)
    if (state) query = query.where('state', state)

    const sprints = await query

    return response.ok({
      status: 'ok',
      data: sprints.map((s) => ({
        id: s.id,
        jiraSprintId: s.jiraSprintId,
        deliveryStreamId: s.deliveryStreamId,
        name: s.name,
        startDate: s.startDate,
        endDate: s.endDate,
        goal: s.goal,
        state: s.state,
      })),
      meta: { computed_at: DateTime.now().toISO() },
    })
  }
}
