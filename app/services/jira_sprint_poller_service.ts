import { DateTime } from 'luxon'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import Sprint from '#models/sprint'
import SprintSnapshot from '#models/sprint_snapshot'
import StatusMapping from '#models/status_mapping'
import type { PipelineStage } from '#models/status_mapping'

const DEV_STAGES: PipelineStage[] = ['dev', 'code_review']
const DONE_STAGES: PipelineStage[] = ['done', 'cancelled']
const MAX_RESULTS = 100

export default class JiraSprintPollerService {
  async run(): Promise<void> {
    const baseUrl = env.get('JIRA_BASE_URL')
    const token = env.get('JIRA_API_TOKEN')
    const email = env.get('JIRA_EMAIL')

    if (!baseUrl || !token || !email) {
      logger.warn('JIRA_BASE_URL, JIRA_API_TOKEN, and JIRA_EMAIL must be set for sprint polling')
      return
    }

    const authHeader = 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64')
    const activeSprints = await Sprint.query().where('state', 'active')

    for (const sprint of activeSprints) {
      await this.pollSprint(sprint, baseUrl, authHeader)
    }

    logger.info({ count: activeSprints.length }, 'Sprint snapshot polling completed')
  }

  private async pollSprint(
    sprint: Sprint,
    baseUrl: string,
    authHeader: string
  ): Promise<void> {
    const issues: any[] = []
    let startAt = 0

    while (true) {
      const url =
        `${baseUrl}/rest/agile/1.0/sprint/${sprint.jiraSprintId}/issue` +
        `?fields=status&maxResults=${MAX_RESULTS}&startAt=${startAt}`

      const resp = await fetch(url, {
        headers: { Authorization: authHeader, Accept: 'application/json' },
      })

      if (!resp.ok) {
        logger.error(
          { status: resp.status, sprintId: sprint.id, jiraSprintId: sprint.jiraSprintId },
          'Jira sprint issue fetch failed — skipping snapshot'
        )
        return
      }

      const data = (await resp.json()) as { issues: any[]; total: number }
      issues.push(...data.issues)
      startAt += data.issues.length
      if (startAt >= data.total) break
    }

    await this.upsertSnapshot(sprint, issues)
  }

  private async upsertSnapshot(sprint: Sprint, issues: any[]): Promise<void> {
    const mappings = await StatusMapping.query()
    const stageMap = new Map<string, PipelineStage>()
    for (const m of mappings) {
      stageMap.set(`${m.jiraProjectKey}:${m.jiraStatusName.toLowerCase()}`, m.pipelineStage)
    }

    let committedCount = issues.length
    let completedCount = 0
    let wipBa = 0
    let wipDev = 0
    let wipQa = 0
    let wipUat = 0

    for (const issue of issues) {
      const statusName = (issue.fields?.status?.name ?? '') as string
      const projectKey = (issue.key as string).split('-')[0]
      const stage = stageMap.get(`${projectKey}:${statusName.toLowerCase()}`)

      if (!stage) continue

      if (DONE_STAGES.includes(stage)) {
        completedCount++
      } else if (stage === 'ba') {
        wipBa++
      } else if (DEV_STAGES.includes(stage)) {
        wipDev++
      } else if (stage === 'qa') {
        wipQa++
      } else if (stage === 'uat') {
        wipUat++
      }
    }

    const remainingCount = committedCount - completedCount
    const snapshotDate = DateTime.now().toISODate()!
    const now = DateTime.now()

    await SprintSnapshot.updateOrCreate(
      { sprintId: sprint.id, snapshotDate },
      {
        source: 'jira',
        deliveryStreamId: sprint.deliveryStreamId,
        techStreamId: null,
        receivedAt: now,
        eventTimestamp: now,
        sprintId: sprint.id,
        snapshotDate,
        committedCount,
        completedCount,
        remainingCount,
        addedAfterStart: 0,
        removedAfterStart: 0,
        wipBa,
        wipDev,
        wipQa,
        wipUat,
      }
    )

    logger.info(
      { sprintId: sprint.id, committedCount, completedCount, remainingCount },
      'Sprint snapshot upserted'
    )
  }
}
