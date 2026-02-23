import { DateTime } from 'luxon'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import TechStream from '#models/tech_stream'
import Repository from '#models/repository'
import PrEvent from '#models/pr_event'
import type { PrEventType } from '#models/pr_event'

const DEFAULT_TICKET_REGEX = /([A-Z][A-Z0-9]+-\d+)/

export default class GitHubBackfillService {
  constructor(private readonly orgName: string) {}

  async run(): Promise<void> {
    const token = env.get('GITHUB_TOKEN')

    if (!token) {
      logger.warn({ orgName: this.orgName }, 'GITHUB_TOKEN must be set for GitHub backfill')
      return
    }

    const repos = await Repository.query()
      .where('github_org', this.orgName)
      .where('is_active', true)

    for (const repo of repos) {
      const techStream = await TechStream.find(repo.techStreamId)
      await this.backfillRepo(repo, techStream, token)
    }

    logger.info({ orgName: this.orgName }, 'GitHub backfill completed')
  }

  private async backfillRepo(
    repo: Repository,
    techStream: TechStream | null,
    token: string
  ): Promise<void> {
    let page = 1
    const perPage = 100

    while (true) {
      const url = `https://api.github.com/repos/${this.orgName}/${repo.githubRepoName}/pulls?state=all&per_page=${perPage}&page=${page}`

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
          'GitHub backfill request failed'
        )
        break
      }

      const prs: any[] = await resp.json()
      if (prs.length === 0) break

      for (const pr of prs) {
        await this.processPr(pr, repo, techStream)
      }

      if (prs.length < perPage) break
      page++
    }
  }

  private async processPr(
    pr: any,
    repo: Repository,
    techStream: TechStream | null
  ): Promise<void> {
    const customRegex = techStream?.ticketRegex ?? null
    const linkedTicketId = this.extractTicketId(
      pr.head?.ref ?? null,
      pr.title ?? null,
      pr.body ?? null,
      customRegex
    )
    const techStreamId = techStream?.id ?? null

    // opened event
    const openedAt = DateTime.fromISO(pr.created_at)
    const existingOpened = await PrEvent.query()
      .where('repo_id', repo.id)
      .where('pr_number', pr.number)
      .where('event_type', 'opened')
      .whereRaw('event_timestamp = ?::timestamptz', [openedAt.toISO()!])
      .first()

    if (!existingOpened) {
      await PrEvent.create({
        source: 'github',
        eventType: 'opened',
        prNumber: pr.number,
        repoId: repo.id,
        githubOrg: this.orgName,
        githubRepo: repo.githubRepoName,
        branchName: pr.head?.ref ?? null,
        baseBranch: pr.base?.ref ?? null,
        linkedTicketId,
        techStreamId,
        eventTimestamp: openedAt,
      })
    }

    // closed / merged event
    if (pr.closed_at) {
      const closedAt = DateTime.fromISO(pr.closed_at)
      const closedEventType: PrEventType = pr.merged_at ? 'merged' : 'closed'

      const existingClosed = await PrEvent.query()
        .where('repo_id', repo.id)
        .where('pr_number', pr.number)
        .where('event_type', closedEventType)
        .whereRaw('event_timestamp = ?::timestamptz', [closedAt.toISO()!])
        .first()

      if (!existingClosed) {
        await PrEvent.create({
          source: 'github',
          eventType: closedEventType,
          prNumber: pr.number,
          repoId: repo.id,
          githubOrg: this.orgName,
          githubRepo: repo.githubRepoName,
          branchName: pr.head?.ref ?? null,
          baseBranch: pr.base?.ref ?? null,
          linkedTicketId,
          techStreamId,
          eventTimestamp: closedAt,
        })
      }
    }
  }

  private extractTicketId(
    branchName: string | null,
    prTitle: string | null,
    prBody: string | null,
    customRegex?: string | null
  ): string | null {
    let regex = DEFAULT_TICKET_REGEX
    if (customRegex) {
      try {
        regex = new RegExp(customRegex)
      } catch {
        // fall back to default on invalid regex
      }
    }
    for (const text of [branchName, prTitle, prBody]) {
      if (!text) continue
      const match = text.match(regex)
      if (match) return match[1]
    }
    return null
  }
}
