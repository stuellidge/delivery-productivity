import type { HttpContext } from '@adonisjs/core/http'
import DeliveryStream from '#models/delivery_stream'
import {
  createDeliveryStreamValidator,
  updateDeliveryStreamValidator,
} from '#validators/delivery_stream_validator'
import logger from '@adonisjs/core/services/logger'

export default class DeliveryStreamsController {
  async index({ view }: HttpContext) {
    const streams = await DeliveryStream.query().orderBy('name')
    return view.render('admin/delivery_streams/index', { streams })
  }

  async create({ view }: HttpContext) {
    return view.render('admin/delivery_streams/create')
  }

  async store({ request, response, session }: HttpContext) {
    try {
      const data = await request.validateUsing(createDeliveryStreamValidator)
      await DeliveryStream.create({
        name: data.name,
        displayName: data.displayName,
        description: data.description ?? null,
        isActive: true,
      })
      session.flash('success', 'Delivery stream created successfully')
      return response.redirect('/admin/streams/delivery')
    } catch (error) {
      if (error.code === 'E_VALIDATION_ERROR') {
        session.flash('errors', error.messages)
      } else {
        session.flash('errors', { store: 'Failed to create delivery stream' })
        logger.error({ err: error, controller: 'DeliveryStreamsController' }, 'Failed to store')
      }
      return response.redirect('/admin/streams/delivery/create')
    }
  }

  async edit({ params, view }: HttpContext) {
    const stream = await DeliveryStream.findOrFail(params.id)
    return view.render('admin/delivery_streams/edit', { stream })
  }

  async update({ params, request, response, session }: HttpContext) {
    const stream = await DeliveryStream.findOrFail(params.id)

    try {
      const data = await request.validateUsing(updateDeliveryStreamValidator, {
        meta: { streamId: stream.id },
      })

      stream.merge({
        name: data.name,
        displayName: data.displayName,
        description: data.description ?? stream.description,
        isActive: data.isActive ?? stream.isActive,
      })
      await stream.save()

      session.flash('success', 'Delivery stream updated successfully')
      return response.redirect('/admin/streams/delivery')
    } catch (error) {
      if (error.code === 'E_VALIDATION_ERROR') {
        session.flash('errors', error.messages)
      } else {
        session.flash('errors', { update: 'Failed to update delivery stream' })
        logger.error({ err: error, controller: 'DeliveryStreamsController' }, 'Failed to update')
      }
      return response.redirect(`/admin/streams/delivery/${params.id}/edit`)
    }
  }

  async destroy({ params, response, session }: HttpContext) {
    const stream = await DeliveryStream.findOrFail(params.id)
    await stream.delete()
    session.flash('success', 'Delivery stream deleted')
    return response.redirect('/admin/streams/delivery')
  }
}
