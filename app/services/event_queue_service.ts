import { DateTime } from 'luxon'
import logger from '@adonisjs/core/services/logger'
import EventQueue from '#models/event_queue'
import type { EventSource } from '#models/event_queue'

const MAX_ATTEMPTS = 3
const DEFAULT_BATCH_LIMIT = 100

type DispatchFn = (row: EventQueue) => Promise<void>

async function defaultDispatch(row: EventQueue): Promise<void> {
  if (row.eventSource === 'jira') {
    const { default: JiraEventNormalizerService } =
      await import('#services/jira_event_normalizer_service')
    const svc = new JiraEventNormalizerService(row.payload as any)
    await svc.process()
  } else if (row.eventSource === 'github') {
    const { default: GithubEventNormalizerService } =
      await import('#services/github_event_normalizer_service')
    // Pass undefined signature so re-validation is skipped (already validated at receipt)
    const svc = new GithubEventNormalizerService(
      row.payload as Record<string, any>,
      row.eventType ?? undefined,
      undefined
    )
    await svc.process()
  }
  // deployment and incident sources handled by their own ingestion paths
}

export default class EventQueueService {
  private readonly dispatch: DispatchFn

  constructor(dispatch?: DispatchFn) {
    this.dispatch = dispatch ?? defaultDispatch
  }

  async enqueue(
    eventSource: EventSource,
    payload: Record<string, unknown>,
    eventType?: string,
    signature?: string
  ): Promise<EventQueue> {
    return EventQueue.create({
      eventSource,
      payload,
      eventType: eventType ?? null,
      signature: signature ?? null,
      status: 'pending',
      attemptCount: 0,
      lastError: null,
      enqueuedAt: DateTime.now(),
      processedAt: null,
    })
  }

  async processPending(limit: number = DEFAULT_BATCH_LIMIT): Promise<{
    processed: number
    failed: number
    deadLettered: number
  }> {
    const rows = await EventQueue.query()
      .where('status', 'pending')
      .orderBy('enqueued_at', 'asc')
      .limit(limit)

    let processed = 0
    let failed = 0
    let deadLettered = 0

    for (const row of rows) {
      try {
        await this.dispatch(row)
        // Use query-based update to avoid Lucid dirty-check issues with JSONB payloads
        // that contain keys named 'toString' (breaks fast-deep-equal comparisons)
        await EventQueue.query().where('id', row.id).update({
          status: 'completed',
          processed_at: DateTime.now().toSQL()!,
        })
        processed++
      } catch (error) {
        const newAttemptCount = row.attemptCount + 1
        const lastError = error instanceof Error ? error.message : String(error)
        const newStatus = newAttemptCount >= MAX_ATTEMPTS ? 'dead_lettered' : 'pending'

        await EventQueue.query().where('id', row.id).update({
          attempt_count: newAttemptCount,
          last_error: lastError,
          status: newStatus,
        })

        if (newStatus === 'dead_lettered') {
          deadLettered++
          logger.warn({ rowId: row.id, error: lastError }, 'Event queue row dead-lettered')
        } else {
          failed++
        }
      }
    }

    return { processed, failed, deadLettered }
  }

  async countPending(): Promise<number> {
    const [row] = await EventQueue.query().where('status', 'pending').count('* as total')
    return Number(row.$extras.total)
  }
}
