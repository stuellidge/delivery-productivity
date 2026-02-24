import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import WorkItemEvent from '#models/work_item_event'
import WorkItemCycle from '#models/work_item_cycle'
import StatusMapping from '#models/status_mapping'
import JiraEventNormalizerService from '#services/jira_event_normalizer_service'

const TS_CREATED = DateTime.fromISO('2026-01-10T10:00:00Z').toMillis()
const TS_TRANSITIONED = DateTime.fromISO('2026-01-12T10:00:00Z').toMillis()
const TS_COMPLETED = DateTime.fromISO('2026-01-15T10:00:00Z').toMillis()

function buildCompletionPayload(ticketKey: string, timestampMs: number) {
  return {
    webhookEvent: 'jira:issue_updated',
    issue: {
      key: ticketKey,
      fields: {
        issuetype: { name: 'Story' },
        priority: { name: 'Medium' },
      },
    },
    changelog: {
      items: [{ field: 'resolution', fromString: null, toString: 'Done' }],
    },
    timestamp: timestampMs,
  }
}

function buildCreatedPayload(ticketKey: string, timestampMs: number) {
  return {
    webhookEvent: 'jira:issue_created',
    issue: {
      key: ticketKey,
      fields: {
        issuetype: { name: 'Story' },
      },
    },
    timestamp: timestampMs,
  }
}

test.group('JiraEventNormalizerService | work_item_cycle trigger', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('creates work_item_cycle when a completed event is processed', async ({ assert }) => {
    await StatusMapping.create({
      jiraProjectKey: 'PAY',
      jiraStatusName: 'In Progress',
      pipelineStage: 'dev',
      isActiveWork: true,
      displayOrder: 1,
    })

    // Seed prior events so compute() has data to work with
    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-1',
      eventType: 'created',
      eventTimestamp: DateTime.fromMillis(TS_CREATED),
    })

    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-1',
      eventType: 'transitioned',
      eventTimestamp: DateTime.fromMillis(TS_TRANSITIONED),
      toStage: 'dev',
    })

    const payload = buildCompletionPayload('PAY-1', TS_COMPLETED)
    await new JiraEventNormalizerService(payload as any).process()

    const cycle = await WorkItemCycle.findBy('ticket_id', 'PAY-1')
    assert.isNotNull(cycle)
  })

  test('does not create work_item_cycle for non-completed events', async ({ assert }) => {
    const payload = buildCreatedPayload('PAY-2', TS_CREATED)
    await new JiraEventNormalizerService(payload as any).process()

    const cycles = await WorkItemCycle.all()
    assert.equal(cycles.length, 0)
  })
})
