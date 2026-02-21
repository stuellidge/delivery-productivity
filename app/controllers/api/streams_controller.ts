import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'
import DeliveryStream from '#models/delivery_stream'
import TechStream from '#models/tech_stream'

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
    const streams = await TechStream.query()
      .where('is_active', true)
      .orderBy('display_name', 'asc')

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
}
