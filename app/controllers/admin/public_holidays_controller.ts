import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import PublicHoliday from '#models/public_holiday'
import logger from '@adonisjs/core/services/logger'

const storeValidator = vine.compile(
  vine.object({
    date: vine.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
    name: vine.string().trim().minLength(1).maxLength(255),
  })
)

export default class PublicHolidaysController {
  async index({ view }: HttpContext) {
    const holidays = await PublicHoliday.query().orderBy('date', 'asc')
    return view.render('admin/public_holidays/index', { holidays })
  }

  async create({ view }: HttpContext) {
    return view.render('admin/public_holidays/create')
  }

  async store({ request, response, session }: HttpContext) {
    try {
      const data = await request.validateUsing(storeValidator)

      const existing = await PublicHoliday.findBy('date', data.date)
      if (existing) {
        session.flash('errors', { date: `A holiday already exists for ${data.date}` })
        return response.redirect('/admin/public-holidays/create')
      }

      await PublicHoliday.create({ date: data.date, name: data.name })
      session.flash('success', `Holiday "${data.name}" added for ${data.date}`)
      return response.redirect('/admin/public-holidays')
    } catch (error) {
      if (error.code === 'E_VALIDATION_ERROR') {
        session.flash('errors', error.messages)
      } else {
        session.flash('errors', { store: 'Failed to create holiday' })
        logger.error(
          { err: error, controller: 'PublicHolidaysController' },
          'Failed to store holiday'
        )
      }
      return response.redirect('/admin/public-holidays/create')
    }
  }

  async destroy({ params, response, session }: HttpContext) {
    const holiday = await PublicHoliday.findOrFail(params.id)
    await holiday.delete()
    session.flash('success', `Holiday "${holiday.name}" removed`)
    return response.redirect('/admin/public-holidays')
  }
}
