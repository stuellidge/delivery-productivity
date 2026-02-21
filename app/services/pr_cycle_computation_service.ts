import { DateTime } from 'luxon'
import PrEvent from '#models/pr_event'
import PrCycle from '#models/pr_cycle'

export default class PrCycleComputationService {
  constructor(
    private readonly repoId: number,
    private readonly prNumber: number,
    private readonly techStreamId: number
  ) {}

  async compute(): Promise<PrCycle | null> {
    const events = await PrEvent.query()
      .where('repo_id', this.repoId)
      .where('pr_number', this.prNumber)
      .orderBy('event_timestamp', 'asc')

    const openedEvent = events.find((e) => e.eventType === 'opened')
    if (!openedEvent) return null

    const mergedEvent = events.find((e) => e.eventType === 'merged')
    const closedEvent = events.find((e) => e.eventType === 'closed')
    const approvedEvent = events.find((e) => e.eventType === 'approved')

    const firstReviewEvent = events.find(
      (e) => e.eventType === 'review_submitted' || e.eventType === 'approved'
    )

    const openedAt = openedEvent.eventTimestamp
    const mergedAt = mergedEvent?.eventTimestamp ?? null
    const approvedAt = approvedEvent?.eventTimestamp ?? null
    const firstReviewAt = firstReviewEvent?.eventTimestamp ?? null

    // Count review rounds: number of review_submitted events
    const reviewRoundEvents = events.filter((e) => e.eventType === 'review_submitted')
    const reviewRounds = reviewRoundEvents.length > 0 ? reviewRoundEvents.length : null

    // Collect unique reviewer hashes from all review-type events
    const allReviewerHashes = [
      ...new Set(
        events
          .filter(
            (e) =>
              (e.eventType === 'review_submitted' ||
                e.eventType === 'changes_requested' ||
                e.eventType === 'approved') &&
              e.reviewerHash !== null
          )
          .map((e) => e.reviewerHash!)
      ),
    ]
    const reviewerHashes = allReviewerHashes.length > 0 ? allReviewerHashes : null
    const reviewerCount = allReviewerHashes.length > 0 ? allReviewerHashes.length : null

    // Get code change stats from merged event or opened event
    const referenceEvent = mergedEvent ?? closedEvent ?? openedEvent
    const linesAdded = referenceEvent.linesAdded ?? null
    const linesRemoved = referenceEvent.linesRemoved ?? null
    const linesChanged =
      linesAdded !== null && linesRemoved !== null ? linesAdded + linesRemoved : null
    const filesChanged = referenceEvent.filesChanged ?? null

    // Compute time metrics
    const timeToFirstReviewHrs = firstReviewAt ? this.hoursBetween(openedAt, firstReviewAt) : null

    const timeToMergeHrs = mergedAt ? this.hoursBetween(openedAt, mergedAt) : null

    // Pull metadata from latest event
    const latestEvent = events[events.length - 1]
    const linkedTicketId = latestEvent?.linkedTicketId ?? openedEvent.linkedTicketId ?? null
    const authorHash = openedEvent.authorHash ?? null

    const data = {
      repoId: this.repoId,
      techStreamId: this.techStreamId,
      deliveryStreamId: null as number | null,
      prNumber: this.prNumber,
      linkedTicketId,
      authorHash,
      openedAt,
      firstReviewAt,
      approvedAt,
      mergedAt,
      timeToFirstReviewHrs,
      timeToMergeHrs,
      reviewRounds,
      reviewerHashes,
      reviewerCount,
      linesChanged,
      filesChanged,
    }

    // Upsert: find existing or create new
    const existing = await PrCycle.query()
      .where('repo_id', this.repoId)
      .where('pr_number', this.prNumber)
      .first()

    if (existing) {
      existing.merge(data)
      await existing.save()
      return existing
    }

    return PrCycle.create(data)
  }

  private hoursBetween(from: DateTime, to: DateTime): number {
    return (to.toMillis() - from.toMillis()) / (1000 * 60 * 60)
  }
}
