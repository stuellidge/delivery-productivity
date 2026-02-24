import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import Sprint from '#models/sprint'
import DeliveryStream from '#models/delivery_stream'
import JiraBacklogPollerService from '#services/jira_backlog_poller_service'

async function createSprint(opts: {
  jiraSprintId?: string
  state: 'future' | 'active' | 'closed'
  startDate?: string
  endDate?: string
  deliveryStreamId?: number | null
}) {
  return Sprint.create({
    jiraSprintId: opts.jiraSprintId ?? `SP-${Math.random()}`,
    name: 'Test Sprint',
    startDate: opts.startDate ?? DateTime.now().minus({ days: 3 }).toISODate()!,
    endDate: opts.endDate ?? DateTime.now().plus({ days: 7 }).toISODate()!,
    state: opts.state,
    deliveryStreamId: opts.deliveryStreamId ?? null,
  })
}

test.group('JiraBacklogPollerService | run', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('transitions future sprint to active when start_date <= today', async ({ assert }) => {
    const sprint = await createSprint({
      state: 'future',
      startDate: DateTime.now().minus({ days: 1 }).toISODate()!,
      endDate: DateTime.now().plus({ days: 7 }).toISODate()!,
    })

    await new JiraBacklogPollerService().run()

    await sprint.refresh()
    assert.equal(sprint.state, 'active')
  })

  test('activates sprint starting exactly today', async ({ assert }) => {
    const sprint = await createSprint({
      state: 'future',
      startDate: DateTime.now().toISODate()!,
      endDate: DateTime.now().plus({ days: 7 }).toISODate()!,
    })

    await new JiraBacklogPollerService().run()

    await sprint.refresh()
    assert.equal(sprint.state, 'active')
  })

  test('does not activate future sprint whose start date is in the future', async ({ assert }) => {
    const sprint = await createSprint({
      state: 'future',
      startDate: DateTime.now().plus({ days: 2 }).toISODate()!,
      endDate: DateTime.now().plus({ days: 9 }).toISODate()!,
    })

    await new JiraBacklogPollerService().run()

    await sprint.refresh()
    assert.equal(sprint.state, 'future')
  })

  test('transitions active sprint to closed when end_date < today', async ({ assert }) => {
    const sprint = await createSprint({
      state: 'active',
      startDate: DateTime.now().minus({ days: 14 }).toISODate()!,
      endDate: DateTime.now().minus({ days: 1 }).toISODate()!,
    })

    await new JiraBacklogPollerService().run()

    await sprint.refresh()
    assert.equal(sprint.state, 'closed')
  })

  test('does not close active sprint ending today or in the future', async ({ assert }) => {
    const sprintEndingToday = await createSprint({
      jiraSprintId: 'SP-TODAY',
      state: 'active',
      startDate: DateTime.now().minus({ days: 7 }).toISODate()!,
      endDate: DateTime.now().toISODate()!,
    })
    const sprintEndingFuture = await createSprint({
      jiraSprintId: 'SP-FUTURE',
      state: 'active',
      startDate: DateTime.now().minus({ days: 3 }).toISODate()!,
      endDate: DateTime.now().plus({ days: 4 }).toISODate()!,
    })

    await new JiraBacklogPollerService().run()

    await sprintEndingToday.refresh()
    await sprintEndingFuture.refresh()
    assert.equal(sprintEndingToday.state, 'active')
    assert.equal(sprintEndingFuture.state, 'active')
  })

  test('does not affect already-closed sprints', async ({ assert }) => {
    const sprint = await createSprint({
      state: 'closed',
      startDate: DateTime.now().minus({ days: 14 }).toISODate()!,
      endDate: DateTime.now().minus({ days: 7 }).toISODate()!,
    })

    await new JiraBacklogPollerService().run()

    await sprint.refresh()
    assert.equal(sprint.state, 'closed')
  })

  test('handles multiple sprints across different states simultaneously', async ({ assert }) => {
    const ds = await DeliveryStream.create({
      name: 'ds-poly',
      displayName: 'Poly',
      isActive: true,
    })
    const toActivate = await createSprint({
      jiraSprintId: 'SP-A',
      state: 'future',
      startDate: DateTime.now().minus({ days: 1 }).toISODate()!,
      endDate: DateTime.now().plus({ days: 6 }).toISODate()!,
      deliveryStreamId: ds.id,
    })
    const toClose = await createSprint({
      jiraSprintId: 'SP-B',
      state: 'active',
      startDate: DateTime.now().minus({ days: 14 }).toISODate()!,
      endDate: DateTime.now().minus({ days: 1 }).toISODate()!,
      deliveryStreamId: ds.id,
    })
    const unchanged = await createSprint({
      jiraSprintId: 'SP-C',
      state: 'active',
      startDate: DateTime.now().minus({ days: 3 }).toISODate()!,
      endDate: DateTime.now().plus({ days: 4 }).toISODate()!,
      deliveryStreamId: ds.id,
    })

    await new JiraBacklogPollerService().run()

    await toActivate.refresh()
    await toClose.refresh()
    await unchanged.refresh()
    assert.equal(toActivate.state, 'active')
    assert.equal(toClose.state, 'closed')
    assert.equal(unchanged.state, 'active')
  })

  test('completes without error when no sprints exist', async () => {
    await new JiraBacklogPollerService().run()
    // No assertion needed — just verifies no exception thrown
  })
})
