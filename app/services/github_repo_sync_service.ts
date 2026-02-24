import logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import TechStream from '#models/tech_stream'
import Repository from '#models/repository'

interface GithubRepo {
  name: string
  full_name: string
  default_branch: string
  archived: boolean
}

export default class GithubRepoSyncService {
  async run(): Promise<void> {
    const token = env.get('GITHUB_TOKEN')

    if (!token) {
      logger.warn('GITHUB_TOKEN must be set for repository sync')
      return
    }

    const techStreams = await TechStream.query().where('is_active', true)

    for (const stream of techStreams) {
      await this.syncOrg(stream, token)
    }

    logger.info({ count: techStreams.length }, 'Repository sync completed')
  }

  private async syncOrg(stream: TechStream, token: string): Promise<void> {
    const repos: GithubRepo[] = []
    let page = 1

    while (true) {
      const url =
        `https://api.github.com/orgs/${stream.githubOrg}/repos` +
        `?type=all&per_page=100&page=${page}`

      const resp = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      })

      if (!resp.ok) {
        logger.error(
          { status: resp.status, githubOrg: stream.githubOrg },
          'GitHub repo list fetch failed — skipping org'
        )
        return
      }

      const pageData = (await resp.json()) as GithubRepo[]
      if (pageData.length === 0) break
      repos.push(...pageData)
      page++
    }

    const activeNames = new Set<string>()

    for (const repo of repos) {
      if (repo.archived) continue
      activeNames.add(repo.name)

      const existing = await Repository.query()
        .where('github_org', stream.githubOrg)
        .where('github_repo_name', repo.name)
        .first()

      if (!existing) {
        await Repository.create({
          techStreamId: stream.id,
          githubOrg: stream.githubOrg,
          githubRepoName: repo.name,
          fullName: repo.full_name,
          defaultBranch: repo.default_branch,
          isDeployable: true,
          isActive: true,
        })
      } else {
        // Only update non-admin-managed fields; preserve isDeployable and deployTarget
        existing.fullName = repo.full_name
        existing.defaultBranch = repo.default_branch
        existing.isActive = true
        await existing.save()
      }
    }

    // Mark repos no longer in the org as inactive
    if (activeNames.size > 0) {
      await Repository.query()
        .where('github_org', stream.githubOrg)
        .where('is_active', true)
        .whereNotIn('github_repo_name', [...activeNames])
        .update({ is_active: false })
    } else {
      // No active repos found — mark all as inactive
      await Repository.query()
        .where('github_org', stream.githubOrg)
        .where('is_active', true)
        .update({ is_active: false })
    }

    logger.info(
      { githubOrg: stream.githubOrg, count: activeNames.size },
      'Org repos synced'
    )
  }
}
