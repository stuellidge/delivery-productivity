import type { HttpContext } from '@adonisjs/core/http'
import PlatformSetting from '#models/platform_setting'
import logger from '@adonisjs/core/services/logger'

interface ThresholdEntry {
  minStreams: number
  maxConfidence: number
  severity: string
}

function isValidThresholdArray(parsed: unknown): parsed is ThresholdEntry[] {
  if (!Array.isArray(parsed)) return false
  return parsed.every(
    (item) =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as ThresholdEntry).minStreams === 'number' &&
      typeof (item as ThresholdEntry).maxConfidence === 'number' &&
      typeof (item as ThresholdEntry).severity === 'string'
  )
}

export default class PlatformSettingsController {
  async index({ view }: HttpContext) {
    const settings = await PlatformSetting.query().orderBy('key')
    return view.render('admin/platform_settings/index', { settings })
  }

  async edit({ params, view }: HttpContext) {
    const setting = await PlatformSetting.findByOrFail('key', params.key)
    return view.render('admin/platform_settings/edit', { setting })
  }

  async update({ params, request, response, session }: HttpContext) {
    const setting = await PlatformSetting.findByOrFail('key', params.key)
    const rawValue = request.input('value', '')

    let parsed: unknown
    try {
      parsed = JSON.parse(rawValue)
    } catch {
      session.flash('errors', { value: 'The value must be valid JSON.' })
      return response.redirect(`/admin/platform-settings/${params.key}/edit`)
    }

    // Extra validation for the thresholds key
    if (
      params.key === 'cross_stream_severity_thresholds' &&
      !isValidThresholdArray(parsed)
    ) {
      session.flash('errors', {
        value:
          'Thresholds must be an array of objects with minStreams (number), maxConfidence (number), and severity (string) fields.',
      })
      return response.redirect(`/admin/platform-settings/${params.key}/edit`)
    }

    try {
      setting.value = parsed
      await setting.save()
      session.flash('success', `Setting "${params.key}" updated successfully.`)
      logger.info({ key: params.key }, 'Platform setting updated')
      return response.redirect('/admin/platform-settings')
    } catch (error) {
      session.flash('errors', { update: 'Failed to save setting.' })
      logger.error({ err: error, key: params.key }, 'Failed to update platform setting')
      return response.redirect(`/admin/platform-settings/${params.key}/edit`)
    }
  }
}
