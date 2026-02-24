import { DateTime } from 'luxon'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import TechStream from '#models/tech_stream'
import Repository from '#models/repository'
import PrEvent from '#models/pr_event'
import GitHubBackfillService from '#services/github_backfill_service'
import type { PrEventType } from '#models/pr_event'

interface CheckResult {
  checked: number
  backfilled: number
}

export default class GithubGapDetectionService {
  constructor(
    private readonly lookbackDays = 7,
    private readonly tokenOverride?: string
  ) {}

  async run(): Promise<CheckResult> {
    const token = this.tokenOverride ?? env.get('GITHUB_TOKEN')

    if (!token) {
      logger.warn('GITHUB_TOKEN must be set for GitHub gap detection')
      return { checked: 0, backfilled: 0 }
    }

    const techStreams = await TechStream.query().where('is_active', true)

    let totalChecked = 0
    let totalBackfilled = 0

    for (const techStream of techStreams) {
      const repos = await Repository.query()
        .where('tech_stream_id', techStream.id)
        .where('is_active', true)

      for (const repo of repos) {
        const { checked, backfilled } = await this.checkRepo(repo, techStream, token)
        totalChecked += checked
        totalBackfilled += backfilled
      }
    }

    logger.info(
      { checked: totalChecked, backfilled: totalBackfilled },
      'GitHub gap detection completed'
    )

    return { checked: totalChecked, backfilled: totalBackfilled }
  }

  private async checkRepo(
    repo: Repository,
    techStream: TechStream,
    token: string
  ): Promise<CheckResult> {
    const since = DateTime.now().minus({ days: this.lookbackDays })
    const url =
      `https://api.github.com/repos/${repo.githubOrg}/${repo.githubRepoName}/pulls` +
      `?state=closed&sort=updated&direction=desc&per_page=100`

    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
    })

    // Rate limit guard: pause 60s when remaining drops below 200
    const remaining = Number(resp.headers.get('X-RateLimit-Remaining') ?? '9999')
    if (remaining < 200) {
      logger.warn({ remaining, repo: repo.fullName }, 'GitHub rate limit low — waiting 60s')
      await new Promise((resolve) => setTimeout(resolve, 60_000))
    }

    if (!resp.ok) {
      logger.error(
        { status: resp.status, repo: repo.fullName },
        'GitHub gap detection request failed'
      )
      return { checked: 0, backfilled: 0 }
    }

    const prs = (await resp.json()) as any[]
    let checked = 0
    let backfilled = 0

    for (const pr of prs) {
      // Skip open PRs (no closed_at)
      if (!pr.closed_at) continue

      // Break early when updated_at falls outside lookback window
      const updatedAt = DateTime.fromISO(pr.updated_at)
      if (updatedAt < since) break

      const closedEventType: PrEventType = pr.merged_at ? 'merged' : 'closed'
      checked++

      const existing = await PrEvent.query()
        .where('repo_id', repo.id)
        .where('pr_number', pr.number)
        .where('event_type', closedEventType)
        .first()

      if (!existing) {
        await new GitHubBackfillService(repo.githubOrg).processPr(pr, repo, techStream)
        backfilled++
      }
    }

    return { checked, backfilled }
  }
}
