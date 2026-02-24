import { test } from '@japa/runner'
import ace from '@adonisjs/core/services/ace'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import Sprint from '#models/sprint'
import PollBacklog from '#commands/poll_backlog'

test.group('Command | scheduler:poll-backlog', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('exits successfully and transitions sprint states', async ({ assert }) => {
    const futureSprint = await Sprint.create({
      jiraSprintId: 'PB-SP-FUTURE',
      name: 'Future Sprint',
      startDate: DateTime.now().minus({ days: 1 }).toISODate()!,
      endDate: DateTime.now().plus({ days: 6 }).toISODate()!,
      state: 'future',
      deliveryStreamId: null,
    })

    const command = await ace.create(PollBacklog, [])
    await command.exec()
    command.assertSucceeded()

    await futureSprint.refresh()
    assert.equal(futureSprint.state, 'active')
  })

  test('exits successfully with no sprints to transition', async () => {
    const command = await ace.create(PollBacklog, [])
    await command.exec()
    command.assertSucceeded()
  })
})
