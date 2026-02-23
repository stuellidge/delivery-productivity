import type { HttpContext } from '@adonisjs/core/http'
import AuditLogService from '#services/audit_log_service'

export default class AuditLogController {
  async index({ view, request }: HttpContext) {
    const limit = Number(request.input('limit', 100))
    const entries = await new AuditLogService().getRecent(Math.min(limit, 500))
    return view.render('admin/audit_log/index', { entries })
  }
}
