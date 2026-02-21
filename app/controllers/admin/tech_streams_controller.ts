import type { HttpContext } from '@adonisjs/core/http'
import TechStream from '#models/tech_stream'
import {
  createTechStreamValidator,
  updateTechStreamValidator,
} from '#validators/tech_stream_validator'
import logger from '@adonisjs/core/services/logger'

export default class TechStreamsController {
  async index({ view }: HttpContext) {
    const streams = await TechStream.query().orderBy('name')
    return view.render('admin/tech_streams/index', { streams })
  }

  async create({ view }: HttpContext) {
    return view.render('admin/tech_streams/create')
  }

  async store({ request, response, session }: HttpContext) {
    try {
      const data = await request.validateUsing(createTechStreamValidator)
      await TechStream.create({
        name: data.name,
        displayName: data.displayName,
        githubOrg: data.githubOrg,
        githubInstallId: data.githubInstallId,
        description: data.description ?? null,
        isActive: true,
      })
      session.flash('success', 'Technology stream created successfully')
      return response.redirect('/admin/streams/tech')
    } catch (error) {
      session.flash('errors', error.messages ?? { store: 'Failed to create tech stream' })
      logger.error({ err: error, controller: 'TechStreamsController' }, 'Failed to store')
      return response.redirect('/admin/streams/tech/create')
    }
  }

  async edit({ params, view }: HttpContext) {
    const stream = await TechStream.findOrFail(params.id)
    return view.render('admin/tech_streams/edit', { stream })
  }

  async update({ params, request, response, session }: HttpContext) {
    const stream = await TechStream.findOrFail(params.id)

    try {
      const data = await request.validateUsing(updateTechStreamValidator, {
        meta: { streamId: stream.id },
      })

      stream.merge({
        name: data.name,
        displayName: data.displayName,
        githubOrg: data.githubOrg,
        githubInstallId: data.githubInstallId,
        description: data.description ?? stream.description,
        isActive: data.isActive ?? stream.isActive,
      })
      await stream.save()

      session.flash('success', 'Technology stream updated successfully')
      return response.redirect('/admin/streams/tech')
    } catch (error) {
      session.flash('errors', error.messages ?? { update: 'Failed to update tech stream' })
      logger.error({ err: error, controller: 'TechStreamsController' }, 'Failed to update')
      return response.redirect(`/admin/streams/tech/${params.id}/edit`)
    }
  }

  async destroy({ params, response, session }: HttpContext) {
    const stream = await TechStream.findOrFail(params.id)
    await stream.delete()
    session.flash('success', 'Technology stream deleted')
    return response.redirect('/admin/streams/tech')
  }
}
