import { DateTime } from 'luxon'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import WorkItemEvent from '#models/work_item_event'
import StatusMapping from '#models/status_mapping'
import DeliveryStream from '#models/delivery_stream'
import WorkItemCycleComputationService from '#services/work_item_cycle_computation_service'
import type { PipelineStage } from '#models/status_mapping'

const COMPLETED_STAGES: PipelineStage[] = ['done', 'cancelled']

export default class JiraBackfillService {
  constructor(private readonly projectKey: string) {}

  async run(): Promise<void> {
    const baseUrl = env.get('JIRA_BASE_URL')
    const token = env.get('JIRA_API_TOKEN')
    const email = env.get('JIRA_EMAIL')

    if (!baseUrl || !token || !email) {
      logger.warn(
        { projectKey: this.projectKey },
        'JIRA_BASE_URL, JIRA_API_TOKEN, and JIRA_EMAIL must be set for backfill'
      )
      return
    }

    const authHeader = 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64')
    let startAt = 0
    const maxResults = 100

    while (true) {
      const jql = encodeURIComponent(`project=${this.projectKey}`)
      const fields = 'status,summary,issuetype,created,updated,customfield_delivery_stream'
      const url = `${baseUrl}/rest/api/3/search?jql=${jql}&expand=changelog&fields=${fields}&maxResults=${maxResults}&startAt=${startAt}`

      const resp = await fetch(url, {
        headers: { Authorization: authHeader, Accept: 'application/json' },
      })

      if (!resp.ok) {
        logger.error(
          { status: resp.status, projectKey: this.projectKey },
          'Jira backfill request failed'
        )
        break
      }

      const data = (await resp.json()) as { issues: any[]; total: number }
      const { issues, total } = data

      for (const issue of issues) {
        await this.processIssue(issue)
      }

      startAt += issues.length
      if (startAt >= total) break
    }

    logger.info({ projectKey: this.projectKey }, 'Jira backfill completed')
  }

  private async processIssue(issue: any): Promise<void> {
    const ticketId: string = issue.key
    const projectKey = ticketId.split('-')[0]
    const createdAt = DateTime.fromISO(issue.fields.created)
    const deliveryStreamId = await this.resolveDeliveryStreamId(
      issue.fields.customfield_delivery_stream
    )
    const ticketType: string | null = issue.fields.issuetype?.name ?? null

    // Create 'created' event (idempotent)
    const existingCreated = await WorkItemEvent.query()
      .where('ticket_id', ticketId)
      .where('event_type', 'created')
      .whereRaw('event_timestamp = ?::timestamptz', [createdAt.toISO()!])
      .first()

    if (!existingCreated) {
      await WorkItemEvent.create({
        source: 'jira',
        ticketId,
        eventType: 'created',
        ticketType,
        deliveryStreamId,
        eventTimestamp: createdAt,
      })
    }

    // Walk changelog histories for status transitions (sorted ascending)
    const histories = [...(issue.changelog?.histories ?? [])].sort(
      (a: any, b: any) =>
        DateTime.fromISO(a.created).toMillis() - DateTime.fromISO(b.created).toMillis()
    )

    for (const history of histories) {
      for (const item of history.items ?? []) {
        if (item.field !== 'status') continue

        const eventTimestamp = DateTime.fromISO(history.created)
        const fromStage = await this.resolveStage(projectKey, item.fromString)
        const toStage = await this.resolveStage(projectKey, item.toString)

        const existing = await WorkItemEvent.query()
          .where('ticket_id', ticketId)
          .where('event_type', 'transitioned')
          .whereRaw('event_timestamp = ?::timestamptz', [eventTimestamp.toISO()!])
          .first()

        if (existing) continue

        await WorkItemEvent.create({
          source: 'jira',
          ticketId,
          eventType: 'transitioned',
          ticketType,
          deliveryStreamId,
          eventTimestamp,
          fromStage,
          toStage,
        })
      }
    }

    // If current status maps to a completed stage, create 'completed' event
    const currentStatusName = issue.fields.status?.name ?? null
    const currentStage = await this.resolveStage(projectKey, currentStatusName)

    if (currentStage && COMPLETED_STAGES.includes(currentStage)) {
      const updatedAt = DateTime.fromISO(issue.fields.updated)

      const existingCompleted = await WorkItemEvent.query()
        .where('ticket_id', ticketId)
        .where('event_type', 'completed')
        .whereRaw('event_timestamp = ?::timestamptz', [updatedAt.toISO()!])
        .first()

      if (!existingCompleted) {
        await WorkItemEvent.create({
          source: 'jira',
          ticketId,
          eventType: 'completed',
          ticketType,
          deliveryStreamId,
          eventTimestamp: updatedAt,
        })
      }
    }

    await new WorkItemCycleComputationService(ticketId).compute()
  }

  private async resolveDeliveryStreamId(streamName: string | undefined): Promise<number | null> {
    if (!streamName) return null
    const stream = await DeliveryStream.findBy('name', streamName)
    return stream?.id ?? null
  }

  private async resolveStage(
    projectKey: string,
    statusName: string | null
  ): Promise<PipelineStage | null> {
    if (!statusName) return null
    const mapping = await StatusMapping.query()
      .where('jira_project_key', projectKey)
      .where('jira_status_name', statusName)
      .first()
    return mapping?.pipelineStage ?? null
  }
}
