import vine from '@vinejs/vine'

export const incidentEventValidator = vine.compile(
  vine.object({
    service_name: vine.string().trim().minLength(1),
    event_type: vine.enum([
      'alarm_triggered',
      'incident_opened',
      'alarm_resolved',
      'incident_resolved',
    ] as const),
    incident_id: vine.string().trim().minLength(1),
    occurred_at: vine.string().trim(),
    severity: vine.string().trim().optional(),
    description: vine.string().trim().optional(),
  })
)
