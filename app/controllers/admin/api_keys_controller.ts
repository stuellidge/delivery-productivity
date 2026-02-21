import { randomBytes, createHash } from 'node:crypto'
import { DateTime } from 'luxon'
import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import ApiKey from '#models/api_key'
import logger from '@adonisjs/core/services/logger'

const storeValidator = vine.compile(
  vine.object({
    displayName: vine.string().trim().minLength(1).maxLength(100),
    expiresAt: vine.string().optional(),
  })
)

export default class ApiKeysController {
  async index({ view }: HttpContext) {
    const keys = await ApiKey.query()
      .select('id', 'display_name', 'is_active', 'created_at', 'last_used_at', 'expires_at')
      .orderBy('created_at', 'desc')
    return view.render('admin/api_keys/index', { keys })
  }

  async create({ view }: HttpContext) {
    return view.render('admin/api_keys/create')
  }

  async store({ request, response, session, auth }: HttpContext) {
    try {
      const data = await request.validateUsing(storeValidator)

      const plaintext = randomBytes(32).toString('hex')
      const keyHash = createHash('sha256').update(plaintext).digest('hex')

      await ApiKey.create({
        keyHash,
        displayName: data.displayName,
        permissions: [],
        isActive: true,
        createdBy: auth.user!.id,
        expiresAt: data.expiresAt ? DateTime.fromISO(data.expiresAt) : null,
      })

      session.flash('newKey', plaintext)
      session.flash('success', 'API key created. Copy the key now — it will not be shown again.')
      return response.redirect('/admin/api-keys')
    } catch (error) {
      if (error.code === 'E_VALIDATION_ERROR') {
        session.flash('errors', error.messages)
      } else {
        session.flash('errors', { store: 'Failed to create API key' })
        logger.error({ err: error, controller: 'ApiKeysController' }, 'Failed to store API key')
      }
      return response.redirect('/admin/api-keys/create')
    }
  }

  async revoke({ params, response, session }: HttpContext) {
    const key = await ApiKey.findOrFail(params.id)
    key.isActive = false
    await key.save()
    session.flash('success', `API key "${key.displayName}" revoked`)
    return response.redirect('/admin/api-keys')
  }
}
