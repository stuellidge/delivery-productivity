import { DateTime } from 'luxon'
import Repository from '#models/repository'
import IncidentEvent from '#models/incident_event'
import DeployIncidentCorrelationService from '#services/deploy_incident_correlation_service'

const RESOLVED_TYPES = new Set(['alarm_resolved', 'incident_resolved'])

export default class IncidentEventService {
  constructor(private readonly payload: Record<string, any>) {}

  async process(): Promise<IncidentEvent | null> {
    const serviceName = this.payload['service_name']
    if (!serviceName) return null

    const repo = await Repository.query().where('deploy_target', serviceName).first()
    if (!repo) return null

    const eventType = this.payload['event_type']
    const incidentId = this.payload['incident_id']

    // Idempotency check
    const existing = await IncidentEvent.query()
      .where('incident_id', incidentId)
      .where('event_type', eventType)
      .first()
    if (existing) return null

    const occurredAt = DateTime.fromISO(this.payload['occurred_at'])
    let timeToRestoreMin: number | null = null
    let resolvedAt: DateTime | null = null

    if (RESOLVED_TYPES.has(eventType)) {
      // Find the matching trigger event
      const triggerEvent = await IncidentEvent.query()
        .where('incident_id', incidentId)
        .where((q) =>
          q.where('event_type', 'alarm_triggered').orWhere('event_type', 'incident_opened')
        )
        .first()

      if (triggerEvent) {
        timeToRestoreMin = Math.round(occurredAt.diff(triggerEvent.occurredAt, 'minutes').minutes)
        resolvedAt = occurredAt
      }
    }

    const event = await IncidentEvent.create({
      eventType,
      incidentId,
      serviceName,
      severity: this.payload['severity'] ?? null,
      description: this.payload['description'] ?? null,
      techStreamId: repo.techStreamId,
      occurredAt,
      resolvedAt,
      timeToRestoreMin,
    })

    if (RESOLVED_TYPES.has(eventType)) {
      await new DeployIncidentCorrelationService().onIncidentResolved(event)
    }

    return event
  }
}
