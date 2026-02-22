import { DateTime } from 'luxon'
import PrCycle from '#models/pr_cycle'
import PrEvent from '#models/pr_event'

export interface ReviewerConcentration {
  reviewerHash: string
  reviewCount: number
  percentage: number
  isConcerning: boolean
}

export interface PrReviewTurnaroundResult {
  p50: number
  p85: number
  reviewerConcentration: ReviewerConcentration[]
  prToTicketLinkageRate: number
  isSuppressed: boolean
}

export default class PrReviewTurnaroundService {
  constructor(
    private readonly techStreamId: number,
    private readonly windowDays: number = 30,
    private readonly minContributors: number = 6
  ) {}

  async compute(): Promise<PrReviewTurnaroundResult> {
    const windowStart = DateTime.now().minus({ days: this.windowDays })

    // 1. Compute p50 and p85 of time_to_first_review_hrs from pr_cycles
    const cycles = await PrCycle.query()
      .where('tech_stream_id', this.techStreamId)
      .where('merged_at', '>=', windowStart.toSQL()!)
      .whereNotNull('time_to_first_review_hrs')

    const reviewTimes = cycles.map((c) => Number(c.timeToFirstReviewHrs)).sort((a, b) => a - b)

    const p50 = this.percentile(reviewTimes, 50)
    const p85 = this.percentile(reviewTimes, 85)

    // 2. Count distinct contributors (authors from opened events + reviewers from review events)
    const reviewEvents = await PrEvent.query()
      .where('tech_stream_id', this.techStreamId)
      .where('event_timestamp', '>=', windowStart.toSQL()!)
      .where('event_type', 'review_submitted')
      .whereNotNull('reviewer_hash')

    const openedEvents = await PrEvent.query()
      .where('tech_stream_id', this.techStreamId)
      .where('event_timestamp', '>=', windowStart.toSQL()!)
      .where('event_type', 'opened')

    const contributorHashes = new Set<string>()
    for (const e of reviewEvents) {
      if (e.reviewerHash) contributorHashes.add(e.reviewerHash)
    }
    for (const e of openedEvents) {
      if (e.authorHash) contributorHashes.add(e.authorHash)
    }

    const distinctContributors = contributorHashes.size
    const isSuppressed = distinctContributors < this.minContributors

    // 3. Compute reviewer concentration (suppressed if team is too small)
    let reviewerConcentration: ReviewerConcentration[] = []
    if (!isSuppressed) {
      const totalReviews = reviewEvents.length
      const reviewerCounts = new Map<string, number>()

      for (const event of reviewEvents) {
        const hash = event.reviewerHash!
        reviewerCounts.set(hash, (reviewerCounts.get(hash) ?? 0) + 1)
      }

      for (const [reviewerHash, count] of reviewerCounts) {
        const percentage = (count / totalReviews) * 100
        reviewerConcentration.push({
          reviewerHash,
          reviewCount: count,
          percentage,
          isConcerning: percentage > 50,
        })
      }
    }

    // 4. Compute PR-to-ticket linkage rate from opened events in window
    const linked = openedEvents.filter((e) => e.linkedTicketId !== null).length
    const prToTicketLinkageRate = openedEvents.length > 0 ? (linked / openedEvents.length) * 100 : 0

    return { p50, p85, reviewerConcentration, prToTicketLinkageRate, isSuppressed }
  }

  private percentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0
    const index = (p / 100) * (sortedValues.length - 1)
    const lower = Math.floor(index)
    const upper = Math.ceil(index)
    if (lower === upper) return sortedValues[lower]
    return sortedValues[lower] + (index - lower) * (sortedValues[upper] - sortedValues[lower])
  }
}
