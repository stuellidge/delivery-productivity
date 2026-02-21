import { DateTime } from 'luxon'
import DefectEvent from '#models/defect_event'

export interface DefectEscapeResult {
  escapeRatePct: number
  count: number
  unattributedCount: number
  unattributedPct: number
  stagePairMatrix: { introducedIn: string; foundIn: string; count: number }[]
}

// Stages considered "escaped" (post-dev / QA)
const ESCAPE_STAGES = new Set(['uat', 'production'])

export default class DefectEscapeRateService {
  constructor(
    private readonly deliveryStreamId?: number,
    private readonly windowDays = 30
  ) {}

  async compute(): Promise<DefectEscapeResult> {
    const windowStart = DateTime.now().minus({ days: this.windowDays })

    // Fetch all events in window (optionally scoped to a stream)
    let query = DefectEvent.query().where('event_timestamp', '>=', windowStart.toSQL()!)

    if (this.deliveryStreamId !== undefined) {
      query = query.where('delivery_stream_id', this.deliveryStreamId)
    }

    const events = await query.orderBy('event_timestamp', 'asc')

    if (events.length === 0) {
      return {
        escapeRatePct: 0,
        count: 0,
        unattributedCount: 0,
        unattributedPct: 0,
        stagePairMatrix: [],
      }
    }

    // Resolve each ticket to its latest event (latest event_timestamp per ticket)
    const latestByTicket = new Map<string, (typeof events)[number]>()
    for (const event of events) {
      const current = latestByTicket.get(event.ticketId)
      if (!current || event.eventTimestamp.toMillis() > current.eventTimestamp.toMillis()) {
        latestByTicket.set(event.ticketId, event)
      }
    }

    const resolved = Array.from(latestByTicket.values())
    const count = resolved.length

    const escaped = resolved.filter((r) => ESCAPE_STAGES.has(r.foundInStage))
    const escapeRatePct = (escaped.length / count) * 100

    const unattributed = resolved.filter((r) => r.introducedInStage === null)
    const unattributedCount = unattributed.length
    const unattributedPct = (unattributedCount / count) * 100

    // Stage-pair matrix — only from attributed rows
    const pairCounts = new Map<string, number>()
    for (const row of resolved) {
      if (row.introducedInStage === null) continue
      const key = `${row.introducedInStage}|${row.foundInStage}`
      pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1)
    }

    const stagePairMatrix = Array.from(pairCounts.entries()).map(([key, c]) => {
      const [introducedIn, foundIn] = key.split('|')
      return { introducedIn, foundIn, count: c }
    })

    return { escapeRatePct, count, unattributedCount, unattributedPct, stagePairMatrix }
  }
}
