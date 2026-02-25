import { test } from '@japa/runner'
import ace from '@adonisjs/core/services/ace'
import testUtils from '@adonisjs/core/services/test_utils'
import TechStream from '#models/tech_stream'
import Repository from '#models/repository'
import SyncRepositories from '#commands/sync_repositories'

let originalFetch: typeof globalThis.fetch

test.group('Command | scheduler:sync-repositories', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())
  group.each.setup(() => {
    originalFetch = globalThis.fetch
    process.env.GITHUB_TOKEN = 'ghp_cmd-test'
  })
  group.each.teardown(() => {
    globalThis.fetch = originalFetch
    delete process.env.GITHUB_TOKEN
  })

  test('exits successfully and syncs repos for active tech streams', async ({ assert }) => {
    await TechStream.create({
      name: 'cmd-stream',
      displayName: 'CMD Stream',
      githubOrg: 'acme-cmd',
      githubInstallId: '55555',
      isActive: true,
    })

    // Page 1 returns one repo; page 2 returns empty to stop pagination
    let callCount = 0
    globalThis.fetch = async () => {
      const page =
        callCount === 0
          ? [
              {
                name: 'cmd-svc',
                full_name: 'acme-cmd/cmd-svc',
                default_branch: 'main',
                archived: false,
              },
            ]
          : []
      callCount++
      return { ok: true, json: async () => page } as Response
    }

    const command = await ace.create(SyncRepositories, [])
    await command.exec()
    command.assertSucceeded()

    const repos = await Repository.query().where('github_org', 'acme-cmd')
    assert.lengthOf(repos, 1)
    assert.equal(repos[0].githubRepoName, 'cmd-svc')
  })

  test('exits successfully with no active tech streams', async () => {
    globalThis.fetch = async () => ({ ok: true, json: async () => [] }) as Response

    const command = await ace.create(SyncRepositories, [])
    await command.exec()
    command.assertSucceeded()
  })
})
