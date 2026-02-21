import { DateTime } from 'luxon'
import WorkItemEvent from '#models/work_item_event'
import DeliveryStream from '#models/delivery_stream'
import StatusMapping from '#models/status_mapping'
import type { WorkItemEventType } from '#models/work_item_event'
import type { PipelineStage } from '#models/status_mapping'

interface ChangelogItem {
  field: string
  fromString: string | null
  toString: string | null
}

export interface JiraWebhookPayload {
  webhookEvent: string
  issue: {
    key: string
    fields: {
      issuetype?: { name: string }
      priority?: { name: string }
      story_points?: number
      labels?: string[]
      customfield_delivery_stream?: string
      resolutiondate?: string
    }
  }
  changelog?: {
    items: ChangelogItem[]
  }
  timestamp: number
}

export default class JiraEventNormalizerService {
  constructor(private readonly payload: JiraWebhookPayload) {}

  async process(): Promise<void> {
    const eventType = this.determineEventType()
    if (!eventType) return

    const { issue, timestamp } = this.payload
    const projectKey = issue.key.split('-')[0]
    const eventTimestamp = DateTime.fromMillis(timestamp)

    // Idempotency: skip if this exact event was already processed
    const existing = await WorkItemEvent.query()
      .where('ticket_id', issue.key)
      .where('event_type', eventType)
      .whereRaw('event_timestamp = ?::timestamptz', [eventTimestamp.toISO()!])
      .first()

    if (existing) return

    const deliveryStreamId = await this.resolveDeliveryStreamId()

    let fromStage: PipelineStage | null = null
    let toStage: PipelineStage | null = null

    if (eventType === 'transitioned') {
      const statusItem = this.payload.changelog!.items.find((i) => i.field === 'status')!
      fromStage = await this.resolveStage(projectKey, statusItem.fromString)
      toStage = await this.resolveStage(projectKey, statusItem.toString)
    }

    await WorkItemEvent.create({
      source: 'jira',
      ticketId: issue.key,
      eventType,
      ticketType: issue.fields.issuetype?.name ?? null,
      deliveryStreamId,
      eventTimestamp,
      fromStage,
      toStage,
      priority: issue.fields.priority?.name ?? null,
      storyPoints: issue.fields.story_points ?? null,
      labels: issue.fields.labels ?? null,
    })
  }

  private determineEventType(): WorkItemEventType | null {
    const { webhookEvent, changelog } = this.payload

    if (webhookEvent === 'jira:issue_created') return 'created'

    if (webhookEvent === 'jira:issue_updated' && changelog) {
      for (const item of changelog.items) {
        if (item.field === 'status') return 'transitioned'
        if (item.field === 'Flagged' && item.toString === 'Impediment') return 'blocked'
        if (item.field === 'resolution' && item.toString) return 'completed'
      }
    }

    return null
  }

  private async resolveDeliveryStreamId(): Promise<number | null> {
    const streamName = this.payload.issue.fields.customfield_delivery_stream
    if (!streamName) return null

    const stream = await DeliveryStream.findBy('name', streamName)
    return stream?.id ?? null
  }

  private async resolveStage(
    projectKey: string,
    jiraStatusName: string | null
  ): Promise<PipelineStage | null> {
    if (!jiraStatusName) return null

    const mapping = await StatusMapping.query()
      .where('jira_project_key', projectKey)
      .where('jira_status_name', jiraStatusName)
      .first()

    return mapping?.pipelineStage ?? null
  }
}
