import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import TechStream from '#models/tech_stream'
import Repository from '#models/repository'
import GithubRepoSyncService from '#services/github_repo_sync_service'

let originalFetch: typeof globalThis.fetch

interface GithubRepo {
  name: string
  full_name: string
  default_branch: string
  archived: boolean
}

function buildRepo(name: string, org: string, opts: Partial<GithubRepo> = {}): GithubRepo {
  return {
    name,
    full_name: `${org}/${name}`,
    default_branch: 'main',
    archived: false,
    ...opts,
  }
}

function mockFetchPages(pages: any[][]) {
  let callCount = 0
  globalThis.fetch = async (_url: string | Request | URL) => {
    const pageRepos = pages[callCount] ?? []
    callCount++
    return { ok: true, json: async () => pageRepos } as Response
  }
}

function mockFetchError(status = 500) {
  globalThis.fetch = async () => ({ ok: false, status, json: async () => [] }) as Response
}

async function createTechStream(githubOrg: string) {
  return TechStream.create({
    name: `stream-${githubOrg}`,
    displayName: githubOrg,
    githubOrg,
    githubInstallId: '12345',
    isActive: true,
  })
}

test.group('GithubRepoSyncService | run', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())
  group.each.setup(() => {
    originalFetch = globalThis.fetch
    process.env.GITHUB_TOKEN = 'ghp_test-token'
  })
  group.each.teardown(() => {
    globalThis.fetch = originalFetch
    delete process.env.GITHUB_TOKEN
  })

  test('inserts new repositories found in the GitHub org', async ({ assert }) => {
    const stream = await createTechStream('acme-api')
    mockFetchPages([
      [buildRepo('payments-service', 'acme-api'), buildRepo('auth-service', 'acme-api')],
      [],
    ])

    await new GithubRepoSyncService().run()

    const repos = await Repository.query()
      .where('tech_stream_id', stream.id)
      .orderBy('github_repo_name', 'asc')
    assert.lengthOf(repos, 2)
    assert.equal(repos[0].githubRepoName, 'auth-service')
    assert.equal(repos[1].githubRepoName, 'payments-service')
    assert.equal(repos[0].fullName, 'acme-api/auth-service')
    assert.equal(repos[0].techStreamId, stream.id)
    assert.equal(repos[0].githubOrg, 'acme-api')
    assert.isTrue(repos[0].isActive)
  })

  test('sets isDeployable=true and defaultBranch=main for newly created repos', async ({
    assert,
  }) => {
    await createTechStream('acme-core')
    mockFetchPages([[buildRepo('core-service', 'acme-core')], []])

    await new GithubRepoSyncService().run()

    const repo = await Repository.findByOrFail('github_repo_name', 'core-service')
    assert.isTrue(repo.isDeployable)
    assert.equal(repo.defaultBranch, 'main')
  })

  test('preserves existing isDeployable and deployTarget on update', async ({ assert }) => {
    const stream = await createTechStream('acme-libs')
    await Repository.create({
      techStreamId: stream.id,
      githubOrg: 'acme-libs',
      githubRepoName: 'shared-lib',
      fullName: 'acme-libs/shared-lib',
      defaultBranch: 'main',
      isDeployable: false,
      deployTarget: null,
      isActive: true,
    })

    mockFetchPages([[buildRepo('shared-lib', 'acme-libs', { default_branch: 'master' })], []])

    await new GithubRepoSyncService().run()

    const repo = await Repository.findByOrFail('github_repo_name', 'shared-lib')
    assert.isFalse(repo.isDeployable, 'isDeployable must not be overwritten')
    assert.equal(repo.defaultBranch, 'master', 'defaultBranch should be updated')
  })

  test('marks repos no longer in org as inactive', async ({ assert }) => {
    const stream = await createTechStream('acme-data')
    // Pre-existing repo that will be absent from API response
    await Repository.create({
      techStreamId: stream.id,
      githubOrg: 'acme-data',
      githubRepoName: 'old-service',
      fullName: 'acme-data/old-service',
      defaultBranch: 'main',
      isDeployable: true,
      deployTarget: null,
      isActive: true,
    })

    mockFetchPages([[buildRepo('new-service', 'acme-data')], []])

    await new GithubRepoSyncService().run()

    const old = await Repository.findByOrFail('github_repo_name', 'old-service')
    assert.isFalse(old.isActive)
    const newRepo = await Repository.findByOrFail('github_repo_name', 'new-service')
    assert.isTrue(newRepo.isActive)
  })

  test('skips archived repositories', async ({ assert }) => {
    await createTechStream('acme-archive')
    mockFetchPages([
      [
        buildRepo('active-repo', 'acme-archive'),
        buildRepo('archived-repo', 'acme-archive', { archived: true }),
      ],
      [],
    ])

    await new GithubRepoSyncService().run()

    const repos = await Repository.query().where('github_org', 'acme-archive')
    assert.lengthOf(repos, 1)
    assert.equal(repos[0].githubRepoName, 'active-repo')
  })

  test('paginates GitHub API until empty page received', async ({ assert }) => {
    await createTechStream('acme-big')
    const page1 = Array.from({ length: 100 }, (_, i) => buildRepo(`svc-${i}`, 'acme-big'))
    const page2 = Array.from({ length: 50 }, (_, i) => buildRepo(`svc-${i + 100}`, 'acme-big'))
    mockFetchPages([page1, page2, []])

    await new GithubRepoSyncService().run()

    const count = await Repository.query().where('github_org', 'acme-big').count('* as total')
    assert.equal(Number(count[0].$extras.total), 150)
  })

  test('skips org and logs error when GitHub API returns non-ok', async ({ assert }) => {
    await createTechStream('acme-err')
    mockFetchError(500)

    // Should not throw
    await new GithubRepoSyncService().run()

    assert.lengthOf(await Repository.query().where('github_org', 'acme-err'), 0)
  })

  test('does nothing and logs warning when GITHUB_TOKEN is not set', async ({ assert }) => {
    delete process.env.GITHUB_TOKEN
    await createTechStream('acme-notoken')

    let fetchCalled = false
    globalThis.fetch = async () => {
      fetchCalled = true
      return { ok: true, json: async () => [] } as Response
    }

    await new GithubRepoSyncService().run()

    assert.isFalse(fetchCalled)
    assert.lengthOf(await Repository.query().where('github_org', 'acme-notoken'), 0)
  })

  test('only syncs active tech streams', async ({ assert }) => {
    await TechStream.create({
      name: 'inactive-stream',
      displayName: 'Inactive',
      githubOrg: 'acme-inactive',
      githubInstallId: '99999',
      isActive: false,
    })

    let fetchCalled = false
    globalThis.fetch = async () => {
      fetchCalled = true
      return { ok: true, json: async () => [] } as Response
    }

    await new GithubRepoSyncService().run()

    assert.isFalse(fetchCalled)
  })

  test('syncs multiple tech stream orgs independently', async ({ assert }) => {
    await createTechStream('acme-org1')
    await createTechStream('acme-org2')

    const capturedUrls: string[] = []
    globalThis.fetch = async (url: string | Request | URL) => {
      capturedUrls.push(url.toString())
      return { ok: true, json: async () => [] } as Response
    }

    await new GithubRepoSyncService().run()

    assert.isTrue(capturedUrls.some((u) => u.includes('acme-org1')))
    assert.isTrue(capturedUrls.some((u) => u.includes('acme-org2')))
  })
})
