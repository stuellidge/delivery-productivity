import type { HttpContext } from '@adonisjs/core/http'
import OidcGroupMapping from '#models/oidc_group_mapping'
import DeliveryStream from '#models/delivery_stream'
import TechStream from '#models/tech_stream'
import { createOidcGroupMappingValidator } from '#validators/oidc_group_mapping_validator'
import logger from '@adonisjs/core/services/logger'

export default class OidcGroupMappingsController {
  /**
   * List all OIDC group mappings.
   */
  async index({ view }: HttpContext) {
    const mappings = await OidcGroupMapping.query().orderBy('provider').orderBy('group_pattern')
    return view.render('admin/oidc_group_mappings/index', { mappings })
  }

  /**
   * Show the create form.
   */
  async create({ view }: HttpContext) {
    const [deliveryStreams, techStreams] = await Promise.all([
      DeliveryStream.query().where('is_active', true).orderBy('display_name'),
      TechStream.query().where('is_active', true).orderBy('display_name'),
    ])
    return view.render('admin/oidc_group_mappings/create', { deliveryStreams, techStreams })
  }

  /**
   * Persist a new mapping.
   */
  async store({ request, response, session, auth }: HttpContext) {
    let data: Awaited<ReturnType<typeof createOidcGroupMappingValidator.validate>>
    try {
      data = await request.validateUsing(createOidcGroupMappingValidator)
    } catch {
      return response.redirect().toRoute('admin.oidc-group-mappings.create')
    }

    try {
      await OidcGroupMapping.create({
        provider: data.provider,
        groupPattern: data.group_pattern,
        isRegex: data.is_regex,
        role: data.role,
        deliveryStreamId: data.delivery_stream_id ? Number(data.delivery_stream_id) : null,
        techStreamId: data.tech_stream_id ? Number(data.tech_stream_id) : null,
        createdBy: auth.user!.id,
      })
      session.flash('success', 'Group mapping created successfully')
      return response.redirect().toRoute('admin.oidc-group-mappings.index')
    } catch (err) {
      logger.error({ err }, 'Failed to create OIDC group mapping')
      session.flash('error', 'Failed to create mapping')
      return response.redirect().toRoute('admin.oidc-group-mappings.create')
    }
  }

  /**
   * Delete a mapping.
   */
  async destroy({ params, response, session }: HttpContext) {
    const mapping = await OidcGroupMapping.findOrFail(params.id)
    await mapping.delete()
    session.flash('success', 'Group mapping deleted')
    return response.redirect().toRoute('admin.oidc-group-mappings.index')
  }
}
