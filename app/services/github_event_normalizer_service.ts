import { createHmac, createHash, timingSafeEqual } from 'node:crypto'
import { DateTime } from 'luxon'
import env from '#start/env'
import TechStream from '#models/tech_stream'
import Repository from '#models/repository'
import PrEvent from '#models/pr_event'
import CicdEvent from '#models/cicd_event'
import DeploymentRecord from '#models/deployment_record'
import PrCycleComputationService from '#services/pr_cycle_computation_service'
import type { PrEventType } from '#models/pr_event'

const TICKET_REGEX = /([A-Z][A-Z0-9]+-\d+)/

export class InvalidSignatureError extends Error {
  constructor() {
    super('Invalid signature')
    this.name = 'InvalidSignatureError'
  }
}

export default class GithubEventNormalizerService {
  constructor(
    private readonly payload: Record<string, any>,
    private readonly githubEventType: string | undefined,
    private readonly signature?: string,
    private readonly secretOverride?: string
  ) {}

  async process(): Promise<void> {
    const secret = this.secretOverride ?? env.get('GITHUB_WEBHOOK_SECRET')

    if (secret && this.signature) {
      if (!this.verifySignature(JSON.stringify(this.payload), this.signature, secret)) {
        throw new InvalidSignatureError()
      }
    }

    if (this.githubEventType === 'pull_request') {
      await this.handlePullRequest()
    } else if (this.githubEventType === 'pull_request_review') {
      await this.handlePrReview()
    } else if (this.githubEventType === 'workflow_run') {
      await this.handleWorkflowRun()
    } else if (this.githubEventType === 'deployment_status') {
      await this.handleDeploymentStatus()
    }
    // Other event types are silently ignored
  }

  private async handlePullRequest(): Promise<void> {
    const { action, pull_request: pr, repository, installation } = this.payload

    let eventType: PrEventType | null = null
    if (action === 'opened') {
      eventType = 'opened'
    } else if (action === 'closed' && pr?.merged) {
      eventType = 'merged'
    } else if (action === 'closed' && !pr?.merged) {
      eventType = 'closed'
    }

    if (!eventType) return

    const techStream = await this.resolveTechStream(installation?.id)
    if (!techStream) return

    const repo = await this.resolveRepository(repository?.full_name)
    if (!repo) return

    const linkedTicketId = this.extractTicketId(
      pr?.head?.ref ?? null,
      pr?.title ?? null,
      pr?.body ?? null
    )

    const eventTimestamp = DateTime.fromISO(pr?.updated_at ?? pr?.created_at)

    // Idempotency: skip if this exact event was already processed
    const existing = await PrEvent.query()
      .where('repo_id', repo.id)
      .where('pr_number', pr.number)
      .where('event_type', eventType)
      .whereRaw('event_timestamp = ?::timestamptz', [eventTimestamp.toISO()!])
      .first()

    if (existing) return

    await PrEvent.create({
      source: 'github',
      eventType,
      prNumber: pr.number,
      repoId: repo.id,
      githubOrg: repository?.owner?.login ?? '',
      githubRepo: repository?.name ?? '',
      authorHash: pr?.user?.login ? this.hashIdentity(pr.user.login) : null,
      branchName: pr?.head?.ref ?? null,
      linkedTicketId,
      baseBranch: pr?.base?.ref ?? null,
      linesAdded: pr?.additions ?? null,
      linesRemoved: pr?.deletions ?? null,
      filesChanged: pr?.changed_files ?? null,
      techStreamId: techStream.id,
      eventTimestamp,
    })

    if (eventType === 'merged' || eventType === 'closed') {
      const computationService = new PrCycleComputationService(repo.id, pr.number, techStream.id)
      await computationService.compute()
    }
  }

  private async handlePrReview(): Promise<void> {
    const { review, pull_request: pr, repository, installation } = this.payload

    const reviewStateMap: Partial<Record<string, PrEventType>> = {
      approved: 'approved',
      changes_requested: 'changes_requested',
      commented: 'review_submitted',
    }

    const eventType = reviewStateMap[review?.state]
    if (!eventType) return

    const techStream = await this.resolveTechStream(installation?.id)
    if (!techStream) return

    const repo = await this.resolveRepository(repository?.full_name)
    if (!repo) return

    const eventTimestamp = DateTime.fromISO(review.submitted_at)

    // Idempotency: skip if this exact event was already processed
    const existing = await PrEvent.query()
      .where('repo_id', repo.id)
      .where('pr_number', pr.number)
      .where('event_type', eventType)
      .whereRaw('event_timestamp = ?::timestamptz', [eventTimestamp.toISO()!])
      .first()

    if (existing) return

    const linkedTicketId = this.extractTicketId(
      pr?.head?.ref ?? null,
      pr?.title ?? null,
      pr?.body ?? null
    )

    await PrEvent.create({
      source: 'github',
      eventType,
      prNumber: pr.number,
      repoId: repo.id,
      githubOrg: repository?.owner?.login ?? '',
      githubRepo: repository?.name ?? '',
      authorHash: pr?.user?.login ? this.hashIdentity(pr.user.login) : null,
      branchName: pr?.head?.ref ?? null,
      linkedTicketId,
      baseBranch: pr?.base?.ref ?? null,
      reviewerHash: review?.user?.login ? this.hashIdentity(review.user.login) : null,
      reviewState: review?.state ?? null,
      techStreamId: techStream.id,
      eventTimestamp,
    })
  }

  private async handleWorkflowRun(): Promise<void> {
    const { action, workflow_run: run, installation } = this.payload

    // Only process completed actions
    if (action !== 'completed') return

    const techStream = await this.resolveTechStream(installation?.id)
    if (!techStream) return

    const pipelineId = String(run?.workflow_id ?? '')
    const pipelineRunId = String(run?.id ?? '')
    const status = run?.conclusion ?? 'unknown'
    const eventTimestamp = DateTime.fromISO(run?.updated_at ?? run?.created_at)

    // Idempotency
    const existing = await CicdEvent.query()
      .where('pipeline_id', pipelineId)
      .where('pipeline_run_id', pipelineRunId)
      .where('event_type', 'build_completed')
      .first()

    if (existing) return

    await CicdEvent.create({
      source: 'github',
      techStreamId: techStream.id,
      eventType: 'build_completed',
      pipelineId,
      pipelineRunId,
      environment: 'ci',
      status,
      commitSha: run?.head_sha ?? null,
      eventTimestamp,
    })
  }

  private async handleDeploymentStatus(): Promise<void> {
    const { deployment, deployment_status: deployStatus, installation } = this.payload

    const state = deployStatus?.state
    if (state !== 'success' && state !== 'failure') return

    const techStream = await this.resolveTechStream(installation?.id)
    if (!techStream) return

    const pipelineId = String(deployment?.id ?? '')
    const pipelineRunId = String(deployStatus?.id ?? '')
    const environment = deployStatus?.environment ?? deployment?.environment ?? 'unknown'
    const eventType = state === 'success' ? 'deploy_completed' : 'deploy_failed'
    const eventTimestamp = DateTime.fromISO(deployStatus?.created_at)

    // Idempotency
    const existing = await CicdEvent.query()
      .where('pipeline_id', pipelineId)
      .where('pipeline_run_id', pipelineRunId)
      .where('event_type', eventType)
      .first()

    if (existing) return

    await CicdEvent.create({
      source: 'github',
      techStreamId: techStream.id,
      eventType,
      pipelineId,
      pipelineRunId,
      environment,
      status: state,
      commitSha: deployment?.sha ?? null,
      eventTimestamp,
    })

    // For production success deploys, also upsert a DeploymentRecord
    if (environment === 'production' && state === 'success') {
      await DeploymentRecord.create({
        techStreamId: techStream.id,
        environment,
        status: 'success',
        commitSha: deployment?.sha ?? null,
        causedIncident: false,
        deployedAt: eventTimestamp,
      })
    }
  }

  private async resolveTechStream(
    installId: string | number | undefined
  ): Promise<TechStream | null> {
    if (installId === undefined || installId === null) return null
    return TechStream.findBy('github_install_id', String(installId))
  }

  private async resolveRepository(fullName: string | undefined): Promise<Repository | null> {
    if (!fullName) return null
    const parts = fullName.split('/')
    if (parts.length < 2) return null
    const [org, repo] = parts
    return Repository.query().where('github_org', org).where('github_repo_name', repo).first()
  }

  private extractTicketId(
    branchName: string | null,
    prTitle: string | null,
    prBody: string | null
  ): string | null {
    for (const text of [branchName, prTitle, prBody]) {
      if (!text) continue
      const match = text.match(TICKET_REGEX)
      if (match) return match[1]
    }
    return null
  }

  private hashIdentity(identifier: string): string {
    const key = env.get('HMAC_KEY')
    if (key) {
      return createHmac('sha256', key).update(identifier).digest('hex')
    }
    return createHash('sha256').update(identifier).digest('hex')
  }

  private verifySignature(payload: string, signature: string, secret: string): boolean {
    const expected = 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex')
    try {
      return timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
    } catch {
      return false
    }
  }
}
