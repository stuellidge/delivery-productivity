import { test } from '@japa/runner'
import ace from '@adonisjs/core/services/ace'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import Sprint from '#models/sprint'
import SprintSnapshot from '#models/sprint_snapshot'
import PollSprintSnapshots from '#commands/poll_sprint_snapshots'

let originalFetch: typeof globalThis.fetch

test.group('Command | scheduler:poll-sprint-snapshots', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())
  group.each.setup(() => {
    originalFetch = globalThis.fetch
    process.env.JIRA_BASE_URL = 'https://jira.example.com'
    process.env.JIRA_API_TOKEN = 'tok'
    process.env.JIRA_EMAIL = 'svc@example.com'
  })
  group.each.teardown(() => {
    globalThis.fetch = originalFetch
    delete process.env.JIRA_BASE_URL
    delete process.env.JIRA_API_TOKEN
    delete process.env.JIRA_EMAIL
  })

  test('exits successfully and creates snapshots for active sprints', async ({ assert }) => {
    await Sprint.create({
      jiraSprintId: 'CMD-SP-1',
      name: 'Command Sprint',
      startDate: DateTime.now().minus({ days: 3 }).toISODate()!,
      endDate: DateTime.now().plus({ days: 7 }).toISODate()!,
      state: 'active',
      deliveryStreamId: null,
    })

    globalThis.fetch = async () =>
      ({ ok: true, json: async () => ({ issues: [], total: 0 }) }) as Response

    const command = await ace.create(PollSprintSnapshots, [])
    await command.exec()
    command.assertSucceeded()

    const snaps = await SprintSnapshot.all()
    assert.isAtLeast(snaps.length, 1)
  })

  test('exits successfully with no active sprints', async () => {
    globalThis.fetch = async () =>
      ({ ok: true, json: async () => ({ issues: [], total: 0 }) }) as Response

    const command = await ace.create(PollSprintSnapshots, [])
    await command.exec()
    command.assertSucceeded()
  })
})
