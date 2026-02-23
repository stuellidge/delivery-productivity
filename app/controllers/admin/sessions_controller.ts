import type { HttpContext } from '@adonisjs/core/http'
import UserSessionService from '#services/user_session_service'

export default class SessionsController {
  async index({ view }: HttpContext) {
    const sessions = await new UserSessionService().listAll(200)
    return view.render('admin/sessions/index', { sessions })
  }

  async revoke({ params, response, session }: HttpContext) {
    const svc = new UserSessionService()
    const s = await svc.revokeById(params.id)
    session.flash('success', `Session for user #${s.userId} revoked`)
    return response.redirect('/admin/sessions')
  }
}
