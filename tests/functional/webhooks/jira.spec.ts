import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import WorkItemEvent from '#models/work_item_event'
import DeliveryStream from '#models/delivery_stream'
import StatusMapping from '#models/status_mapping'
import EventQueueService from '#services/event_queue_service'

const WEBHOOK_PATH = '/api/v1/webhooks/jira'

// Sample Jira webhook payloads
const issueCreatedPayload = {
  webhookEvent: 'jira:issue_created',
  issue: {
    key: 'PAY-456',
    fields: {
      issuetype: { name: 'Story' },
      priority: { name: 'High' },
      story_points: 3,
      labels: ['backend'],
      customfield_delivery_stream: 'payments',
      created: '2026-02-01T09:00:00.000+0000',
    },
  },
  timestamp: 1738396800000,
}

const statusTransitionPayload = {
  webhookEvent: 'jira:issue_updated',
  changelog: {
    items: [
      {
        field: 'status',
        fromString: 'To Do',
        toString: 'In Development',
      },
    ],
  },
  issue: {
    key: 'PAY-456',
    fields: {
      issuetype: { name: 'Story' },
      priority: { name: 'High' },
      customfield_delivery_stream: 'payments',
    },
  },
  timestamp: 1738396900000,
}

async function drainQueue() {
  await new EventQueueService().processPending()
}

test.group('Jira Webhooks | issue_created', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns 202 and creates a work_item_event', async ({ client, assert }) => {
    await DeliveryStream.create({
      name: 'payments',
      displayName: 'Payments',
      isActive: true,
    })

    const response = await client.post(WEBHOOK_PATH).json(issueCreatedPayload)

    response.assertStatus(202)

    await drainQueue()

    const event = await WorkItemEvent.query()
      .where('ticket_id', 'PAY-456')
      .where('event_type', 'created')
      .first()

    assert.isNotNull(event)
    assert.equal(event!.ticketId, 'PAY-456')
    assert.equal(event!.ticketType, 'Story')
    assert.equal(event!.source, 'jira')
  })

  test('returns 202 and resolves delivery_stream_id from payload', async ({ client, assert }) => {
    const stream = await DeliveryStream.create({
      name: 'payments',
      displayName: 'Payments',
      isActive: true,
    })

    await client.post(WEBHOOK_PATH).json(issueCreatedPayload)
    await drainQueue()

    const event = await WorkItemEvent.findByOrFail('ticket_id', 'PAY-456')
    assert.equal(event.deliveryStreamId, stream.id)
  })

  test('is idempotent — duplicate webhook is rejected with 202', async ({ client, assert }) => {
    await DeliveryStream.create({ name: 'payments', displayName: 'Payments', isActive: true })

    await client.post(WEBHOOK_PATH).json(issueCreatedPayload)
    await client.post(WEBHOOK_PATH).json(issueCreatedPayload)
    await drainQueue()

    const count = await WorkItemEvent.query()
      .where('ticket_id', 'PAY-456')
      .where('event_type', 'created')
      .count('* as total')

    assert.equal(Number(count[0].$extras.total), 1)
  })
})

test.group('Jira Webhooks | status_transition', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('creates a transitioned event with pipeline stage resolution', async ({
    client,
    assert,
  }) => {
    await DeliveryStream.create({ name: 'payments', displayName: 'Payments', isActive: true })
    await StatusMapping.create({
      jiraProjectKey: 'PAY',
      jiraStatusName: 'In Development',
      pipelineStage: 'dev',
      isActiveWork: true,
      displayOrder: 3,
    })
    await StatusMapping.create({
      jiraProjectKey: 'PAY',
      jiraStatusName: 'To Do',
      pipelineStage: 'backlog',
      isActiveWork: false,
      displayOrder: 0,
    })

    const response = await client.post(WEBHOOK_PATH).json(statusTransitionPayload)

    response.assertStatus(202)

    await drainQueue()

    const event = await WorkItemEvent.query()
      .where('ticket_id', 'PAY-456')
      .where('event_type', 'transitioned')
      .firstOrFail()

    assert.equal(event.fromStage, 'backlog')
    assert.equal(event.toStage, 'dev')
  })

  test('creates transitioned event without stage mapping if not configured', async ({
    client,
    assert,
  }) => {
    await DeliveryStream.create({ name: 'payments', displayName: 'Payments', isActive: true })

    const response = await client.post(WEBHOOK_PATH).json(statusTransitionPayload)

    response.assertStatus(202)

    await drainQueue()

    const event = await WorkItemEvent.query()
      .where('ticket_id', 'PAY-456')
      .where('event_type', 'transitioned')
      .first()

    assert.isNotNull(event)
    assert.isNull(event!.fromStage)
    assert.isNull(event!.toStage)
  })
})

test.group('Jira Webhooks | flagged/blocked', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('creates a blocked event when issue is flagged', async ({ client, assert }) => {
    await DeliveryStream.create({ name: 'payments', displayName: 'Payments', isActive: true })

    const flaggedPayload = {
      webhookEvent: 'jira:issue_updated',
      changelog: {
        items: [
          {
            field: 'Flagged',
            fromString: '',
            toString: 'Impediment',
          },
        ],
      },
      issue: {
        key: 'PAY-456',
        fields: {
          customfield_delivery_stream: 'payments',
        },
      },
      timestamp: 1738397000000,
    }

    const response = await client.post(WEBHOOK_PATH).json(flaggedPayload)
    response.assertStatus(202)

    await drainQueue()

    const event = await WorkItemEvent.query()
      .where('ticket_id', 'PAY-456')
      .where('event_type', 'blocked')
      .first()

    assert.isNotNull(event)
  })
})

test.group('Jira Webhooks | delivery stream resolution', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('sets delivery_stream_id to null when field is absent from payload', async ({
    client,
    assert,
  }) => {
    const payloadWithoutStream = {
      webhookEvent: 'jira:issue_created',
      issue: {
        key: 'PAY-999',
        fields: { issuetype: { name: 'Story' } },
      },
      timestamp: 1738396800000,
    }

    await client.post('/api/v1/webhooks/jira').json(payloadWithoutStream)
    await drainQueue()

    const event = await WorkItemEvent.findByOrFail('ticket_id', 'PAY-999')
    assert.isNull(event.deliveryStreamId)
  })

  test('sets delivery_stream_id to null when stream name not found in DB', async ({
    client,
    assert,
  }) => {
    // No DeliveryStream seeded — stream lookup returns null
    const payload = {
      webhookEvent: 'jira:issue_created',
      issue: {
        key: 'PAY-998',
        fields: {
          issuetype: { name: 'Story' },
          customfield_delivery_stream: 'nonexistent-stream',
        },
      },
      timestamp: 1738396800000,
    }

    await client.post('/api/v1/webhooks/jira').json(payload)
    await drainQueue()

    const event = await WorkItemEvent.findByOrFail('ticket_id', 'PAY-998')
    assert.isNull(event.deliveryStreamId)
  })
})

test.group('Jira Webhooks | stage resolution with null fromString', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('sets from_stage to null when changelog fromString is null', async ({ client, assert }) => {
    await DeliveryStream.create({ name: 'payments', displayName: 'Payments', isActive: true })
    await StatusMapping.create({
      jiraProjectKey: 'PAY',
      jiraStatusName: 'In Development',
      pipelineStage: 'dev',
      isActiveWork: true,
      displayOrder: 2,
    })

    const payload = {
      webhookEvent: 'jira:issue_updated',
      changelog: {
        items: [{ field: 'status', fromString: null, toString: 'In Development' }],
      },
      issue: {
        key: 'PAY-456',
        fields: { customfield_delivery_stream: 'payments' },
      },
      timestamp: 1738396900000,
    }

    await client.post('/api/v1/webhooks/jira').json(payload)
    await drainQueue()

    const event = await WorkItemEvent.query()
      .where('ticket_id', 'PAY-456')
      .where('event_type', 'transitioned')
      .firstOrFail()

    assert.isNull(event.fromStage)
    assert.equal(event.toStage, 'dev')
  })
})

test.group('Jira Webhooks | unrecognised event', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns 202 and creates no event for unrecognised changelog field', async ({
    client,
    assert,
  }) => {
    await DeliveryStream.create({ name: 'payments', displayName: 'Payments', isActive: true })

    const unknownPayload = {
      webhookEvent: 'jira:issue_updated',
      changelog: {
        items: [{ field: 'assignee', fromString: 'Alice', toString: 'Bob' }],
      },
      issue: {
        key: 'PAY-456',
        fields: { customfield_delivery_stream: 'payments' },
      },
      timestamp: 1738397000000,
    }

    const response = await client.post('/api/v1/webhooks/jira').json(unknownPayload)
    response.assertStatus(202)

    await drainQueue()

    const count = await WorkItemEvent.query().where('ticket_id', 'PAY-456').count('* as total')
    assert.equal(Number(count[0].$extras.total), 0)
  })
})

test.group('Jira Webhooks | completed', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('creates a completed event when resolution is set', async ({ client, assert }) => {
    await DeliveryStream.create({ name: 'payments', displayName: 'Payments', isActive: true })

    const completedPayload = {
      webhookEvent: 'jira:issue_updated',
      changelog: {
        items: [
          {
            field: 'resolution',
            fromString: null,
            toString: 'Done',
          },
        ],
      },
      issue: {
        key: 'PAY-456',
        fields: {
          customfield_delivery_stream: 'payments',
          resolutiondate: '2026-02-10T14:00:00.000+0000',
        },
      },
      timestamp: 1738656000000,
    }

    const response = await client.post(WEBHOOK_PATH).json(completedPayload)
    response.assertStatus(202)

    await drainQueue()

    const event = await WorkItemEvent.query()
      .where('ticket_id', 'PAY-456')
      .where('event_type', 'completed')
      .first()

    assert.isNotNull(event)
  })
})
