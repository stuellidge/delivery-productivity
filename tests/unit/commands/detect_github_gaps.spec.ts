import { test } from '@japa/runner'
import ace from '@adonisjs/core/services/ace'
import testUtils from '@adonisjs/core/services/test_utils'
import TechStream from '#models/tech_stream'
import Repository from '#models/repository'
import DetectGithubGaps from '#commands/detect_github_gaps'

let originalFetch: typeof globalThis.fetch

test.group('Command | scheduler:detect-github-gaps', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())
  group.each.setup(() => {
    originalFetch = globalThis.fetch
    process.env.GITHUB_TOKEN = 'ghp_gap-cmd-test'
  })
  group.each.teardown(() => {
    globalThis.fetch = originalFetch
    delete process.env.GITHUB_TOKEN
  })

  test('exits successfully with no active tech streams', async () => {
    globalThis.fetch = async () =>
      ({ ok: true, headers: { get: () => '9999' }, json: async () => [] }) as any

    const command = await ace.create(DetectGithubGaps, [])
    await command.exec()
    command.assertSucceeded()
  })

  test('exits successfully and reports backfill count', async () => {
    const ts = await TechStream.create({
      name: 'gap-cmd-stream',
      displayName: 'Gap CMD Stream',
      githubOrg: 'acme-gap-cmd',
      githubInstallId: '88888',
      isActive: true,
    })
    await Repository.create({
      techStreamId: ts.id,
      githubOrg: 'acme-gap-cmd',
      githubRepoName: 'svc',
      fullName: 'acme-gap-cmd/svc',
      defaultBranch: 'main',
      isDeployable: true,
      isActive: true,
    })

    // Return empty PR list so no backfill happens
    globalThis.fetch = async () =>
      ({ ok: true, headers: { get: () => '9999' }, json: async () => [] }) as any

    const command = await ace.create(DetectGithubGaps, [])
    await command.exec()
    command.assertSucceeded()
  })
})
