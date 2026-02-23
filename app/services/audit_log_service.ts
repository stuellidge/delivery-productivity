import AuditLog from '#models/audit_log'

export interface AuditLogEntry {
  actorUserId: number | null
  actorEmail: string
  action: string
  entityType?: string
  entityId?: string
  detail?: Record<string, any>
  ipAddress?: string
}

export default class AuditLogService {
  async record(entry: AuditLogEntry): Promise<void> {
    await AuditLog.create({
      actorUserId: entry.actorUserId,
      actorEmail: entry.actorEmail,
      action: entry.action,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      detail: entry.detail ?? null,
      ipAddress: entry.ipAddress ?? null,
    })
  }

  async getRecent(limit: number = 50): Promise<AuditLog[]> {
    return AuditLog.query()
      .preload('actor')
      .orderBy('created_at', 'desc')
      .limit(limit)
  }
}
