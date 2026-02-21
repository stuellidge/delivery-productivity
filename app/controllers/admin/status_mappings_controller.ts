import type { HttpContext } from '@adonisjs/core/http'
import StatusMapping from '#models/status_mapping'
import {
  createStatusMappingValidator,
  updateStatusMappingValidator,
} from '#validators/status_mapping_validator'
import logger from '@adonisjs/core/services/logger'

export default class StatusMappingsController {
  async index({ view }: HttpContext) {
    const mappings = await StatusMapping.query()
      .orderBy('jira_project_key')
      .orderBy('display_order')
    return view.render('admin/status_mappings/index', { mappings })
  }

  async create({ view }: HttpContext) {
    return view.render('admin/status_mappings/create')
  }

  async store({ request, response, session }: HttpContext) {
    try {
      const data = await request.validateUsing(createStatusMappingValidator)
      await StatusMapping.create({
        jiraProjectKey: data.jiraProjectKey,
        jiraStatusName: data.jiraStatusName,
        pipelineStage: data.pipelineStage,
        isActiveWork: data.isActiveWork,
        displayOrder: data.displayOrder ?? 0,
      })
      session.flash('success', 'Status mapping created successfully')
      return response.redirect('/admin/status-mappings')
    } catch (error) {
      session.flash('errors', error.messages ?? { store: 'Failed to create status mapping' })
      logger.error({ err: error, controller: 'StatusMappingsController' }, 'Failed to store')
      return response.redirect('/admin/status-mappings/create')
    }
  }

  async edit({ params, view }: HttpContext) {
    const mapping = await StatusMapping.findOrFail(params.id)
    return view.render('admin/status_mappings/edit', { mapping })
  }

  async update({ params, request, response, session }: HttpContext) {
    const mapping = await StatusMapping.findOrFail(params.id)

    try {
      const data = await request.validateUsing(updateStatusMappingValidator)
      mapping.merge({
        jiraProjectKey: data.jiraProjectKey,
        jiraStatusName: data.jiraStatusName,
        pipelineStage: data.pipelineStage,
        isActiveWork: data.isActiveWork,
        displayOrder: data.displayOrder ?? mapping.displayOrder,
      })
      await mapping.save()

      session.flash('success', 'Status mapping updated successfully')
      return response.redirect('/admin/status-mappings')
    } catch (error) {
      session.flash('errors', error.messages ?? { update: 'Failed to update status mapping' })
      logger.error({ err: error, controller: 'StatusMappingsController' }, 'Failed to update')
      return response.redirect(`/admin/status-mappings/${params.id}/edit`)
    }
  }

  async destroy({ params, response, session }: HttpContext) {
    const mapping = await StatusMapping.findOrFail(params.id)
    await mapping.delete()
    session.flash('success', 'Status mapping deleted')
    return response.redirect('/admin/status-mappings')
  }
}
