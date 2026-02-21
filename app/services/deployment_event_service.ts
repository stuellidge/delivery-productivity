import { DateTime } from 'luxon'
import Repository from '#models/repository'
import PrCycle from '#models/pr_cycle'
import DeploymentRecord from '#models/deployment_record'
import DeployIncidentCorrelationService from '#services/deploy_incident_correlation_service'

export default class DeploymentEventService {
  constructor(private readonly payload: Record<string, any>) {}

  async process(): Promise<DeploymentRecord | null> {
    const repoFullName = this.payload['repo_full_name']
    if (!repoFullName) return null

    const repo = await Repository.findBy('full_name', repoFullName)
    if (!repo) return null

    const deployedAt = DateTime.fromISO(this.payload['deployed_at'])
    let leadTimeHrs: number | null = null
    let linkedTicketId: string | null = null
    const prNumber: number | null = this.payload['pr_number'] ?? null

    if (prNumber) {
      const prCycle = await PrCycle.query()
        .where('repo_id', repo.id)
        .where('pr_number', prNumber)
        .first()

      if (prCycle) {
        leadTimeHrs = deployedAt.diff(prCycle.openedAt, 'hours').hours
        linkedTicketId = prCycle.linkedTicketId
      }
    }

    const record = await DeploymentRecord.create({
      techStreamId: repo.techStreamId,
      repoId: repo.id,
      environment: this.payload['environment'],
      status: this.payload['status'],
      commitSha: this.payload['commit_sha'] ?? null,
      pipelineId: this.payload['pipeline_id'] ?? null,
      triggerType: this.payload['trigger_type'] ?? null,
      linkedPrNumber: prNumber,
      linkedTicketId,
      leadTimeHrs,
      causedIncident: false,
      deployedAt,
    })

    await new DeployIncidentCorrelationService().onDeploy(record)

    return record
  }
}
