import DeploymentRecord from '#models/deployment_record'
import IncidentEvent from '#models/incident_event'

export default class DeployIncidentCorrelationService {
  static readonly CORRELATION_WINDOW_MINUTES = 60

  async onDeploy(record: DeploymentRecord): Promise<void> {
    if (record.environment !== 'production') return

    const windowEnd = record.deployedAt.plus({
      minutes: DeployIncidentCorrelationService.CORRELATION_WINDOW_MINUTES,
    })

    const incident = await IncidentEvent.query()
      .where('tech_stream_id', record.techStreamId)
      .where('occurred_at', '>=', record.deployedAt.toSQL()!)
      .where('occurred_at', '<=', windowEnd.toSQL()!)
      .first()

    if (incident) {
      record.causedIncident = true
      record.incidentId = incident.incidentId
      await record.save()
    }
  }

  async onIncidentResolved(event: IncidentEvent): Promise<void> {
    const windowStart = event.occurredAt.minus({
      minutes: DeployIncidentCorrelationService.CORRELATION_WINDOW_MINUTES,
    })

    const deploy = await DeploymentRecord.query()
      .where('tech_stream_id', event.techStreamId)
      .where('environment', 'production')
      .where('deployed_at', '>=', windowStart.toSQL()!)
      .where('deployed_at', '<=', event.occurredAt.toSQL()!)
      .orderBy('deployed_at', 'desc')
      .first()

    if (deploy) {
      deploy.causedIncident = true
      deploy.incidentId = event.incidentId
      await deploy.save()

      event.relatedDeployId = deploy.id
      await event.save()
    }
  }
}
