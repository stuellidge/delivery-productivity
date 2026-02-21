import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'

export interface SourceHealth {
  source: string
  lastEventAt: DateTime | null
  eventCountLastHour: number
  status: 'healthy' | 'stale' | 'no_data'
}

const STALE_THRESHOLD_HOURS = 2

function classify(lastEventAt: DateTime | null): 'healthy' | 'stale' | 'no_data' {
  if (!lastEventAt) return 'no_data'
  const hoursSince = DateTime.now().diff(lastEventAt, 'hours').hours
  return hoursSince <= STALE_THRESHOLD_HOURS ? 'healthy' : 'stale'
}

export default class IntegrationHealthService {
  async getHealth(): Promise<{
    sources: SourceHealth[]
    webhookSources: SourceHealth[]
    eventSources: SourceHealth[]
    computedAt: string
  }> {
    const [jira, github, deployment, incident] = await Promise.all([
      this.getWebhookSourceHealth('jira'),
      this.getGithubHealth(),
      this.getEventSourceHealth('deployment'),
      this.getEventSourceHealth('incident'),
    ])

    const webhookSources: SourceHealth[] = [jira, github]
    const eventSources: SourceHealth[] = [deployment, incident]
    const sources: SourceHealth[] = [...webhookSources, ...eventSources]

    return {
      sources,
      webhookSources,
      eventSources,
      computedAt: DateTime.now().toISO()!,
    }
  }

  private async getWebhookSourceHealth(source: string): Promise<SourceHealth> {
    const oneHourAgo = DateTime.now().minus({ hours: 1 }).toSQL()!

    const [lastRow] = await db
      .from('work_item_events')
      .where('source', source)
      .orderBy('received_at', 'desc')
      .limit(1)
      .select('received_at')

    const [countRow] = await db
      .from('work_item_events')
      .where('source', source)
      .where('received_at', '>=', oneHourAgo)
      .count('* as count')

    const lastEventAt = lastRow?.received_at
      ? DateTime.fromJSDate(new Date(lastRow.received_at))
      : null

    return {
      source,
      lastEventAt,
      eventCountLastHour: Number(countRow.count),
      status: classify(lastEventAt),
    }
  }

  private async getGithubHealth(): Promise<SourceHealth> {
    const oneHourAgo = DateTime.now().minus({ hours: 1 }).toSQL()!

    const [lastRow] = await db
      .from('pr_events')
      .orderBy('event_timestamp', 'desc')
      .limit(1)
      .select('event_timestamp')

    const [countRow] = await db
      .from('pr_events')
      .where('event_timestamp', '>=', oneHourAgo)
      .count('* as count')

    const lastEventAt = lastRow?.event_timestamp
      ? DateTime.fromJSDate(new Date(lastRow.event_timestamp))
      : null

    return {
      source: 'github',
      lastEventAt,
      eventCountLastHour: Number(countRow.count),
      status: classify(lastEventAt),
    }
  }

  private async getEventSourceHealth(source: string): Promise<SourceHealth> {
    const table = source === 'deployment' ? 'deployment_records' : 'incident_events'
    const timestampCol = source === 'deployment' ? 'deployed_at' : 'occurred_at'
    const oneHourAgo = DateTime.now().minus({ hours: 1 }).toSQL()!

    const [lastRow] = await db
      .from(table)
      .orderBy(timestampCol, 'desc')
      .limit(1)
      .select(timestampCol)

    const [countRow] = await db
      .from(table)
      .where(timestampCol, '>=', oneHourAgo)
      .count('* as count')

    const raw = lastRow?.[timestampCol]
    const lastEventAt = raw ? DateTime.fromJSDate(new Date(raw)) : null

    return {
      source,
      lastEventAt,
      eventCountLastHour: Number(countRow.count),
      status: classify(lastEventAt),
    }
  }
}
