import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import EventQueue from '#models/event_queue'
import WorkItemEvent from '#models/work_item_event'
import EventQueueService from '#services/event_queue_service'

// ─── enqueue ─────────────────────────────────────────────────────────────────

test.group('EventQueueService | enqueue', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('creates a pending event_queue row with the correct fields', async ({ assert }) => {
    const svc = new EventQueueService()
    const payload = { webhookEvent: 'jira:issue_created', issue: { key: 'PAY-1' }, timestamp: 123 }

    const row = await svc.enqueue('jira', payload)

    assert.equal(row.eventSource, 'jira')
    assert.equal(row.status, 'pending')
    assert.equal(row.attemptCount, 0)
    assert.isNull(row.processedAt)
    assert.deepEqual(row.payload, payload)
  })

  test('stores eventType and signature for GitHub events', async ({ assert }) => {
    const svc = new EventQueueService()
    const row = await svc.enqueue(
      'github',
      { action: 'opened' },
      'pull_request',
      'sha256=abc123'
    )

    assert.equal(row.eventType, 'pull_request')
    assert.equal(row.signature, 'sha256=abc123')
  })

  test('eventType and signature default to null for non-GitHub sources', async ({ assert }) => {
    const svc = new EventQueueService()
    const row = await svc.enqueue('jira', { webhookEvent: 'jira:issue_created', issue: { key: 'X-1' }, timestamp: 1 })

    assert.isNull(row.eventType)
    assert.isNull(row.signature)
  })
})

// ─── processPending ───────────────────────────────────────────────────────────

test.group('EventQueueService | processPending', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('marks a successfully dispatched row as completed', async ({ assert }) => {
    const noop = async () => {}
    const svc = new EventQueueService(noop)
    const row = await svc.enqueue('jira', {})

    const result = await svc.processPending()

    assert.equal(result.processed, 1)
    assert.equal(result.failed, 0)
    assert.equal(result.deadLettered, 0)

    await row.refresh()
    assert.equal(row.status, 'completed')
    assert.isNotNull(row.processedAt)
  })

  test('increments attempt_count and keeps status pending on first failure', async ({
    assert,
  }) => {
    const fail = async () => {
      throw new Error('dispatch failed')
    }
    const svc = new EventQueueService(fail)
    const row = await svc.enqueue('jira', {})

    const result = await svc.processPending()

    assert.equal(result.processed, 0)
    assert.equal(result.failed, 1)

    await row.refresh()
    assert.equal(row.status, 'pending')
    assert.equal(row.attemptCount, 1)
    assert.equal(row.lastError, 'dispatch failed')
  })

  test('dead-letters a row after 3 failed attempts', async ({ assert }) => {
    const fail = async () => {
      throw new Error('always fails')
    }
    const svc = new EventQueueService(fail)
    const row = await svc.enqueue('jira', {})

    await svc.processPending() // attempt 1
    await svc.processPending() // attempt 2
    await svc.processPending() // attempt 3

    await row.refresh()
    assert.equal(row.status, 'dead_lettered')
    assert.equal(row.attemptCount, 3)

    const result = await svc.processPending() // attempt 4 — should be ignored
    assert.equal(result.deadLettered, 0) // no new dead-letters, row already dead-lettered
  })

  test('only processes pending rows — skips completed and dead_lettered', async ({ assert }) => {
    let callCount = 0
    const countCalls = async () => {
      callCount++
    }
    const svc = new EventQueueService(countCalls)

    await EventQueue.create({
      eventSource: 'jira',
      payload: {},
      status: 'completed',
      attemptCount: 0,
      enqueuedAt: DateTime.now(),
    })
    await EventQueue.create({
      eventSource: 'jira',
      payload: {},
      status: 'dead_lettered',
      attemptCount: 3,
      enqueuedAt: DateTime.now(),
    })
    await svc.enqueue('jira', {}) // pending

    await svc.processPending()

    assert.equal(callCount, 1)
  })

  test('processes Jira events end-to-end, creating WorkItemEvents', async ({ assert }) => {
    const svc = new EventQueueService()
    await svc.enqueue('jira', {
      webhookEvent: 'jira:issue_created',
      issue: { key: 'E2E-1', fields: { issuetype: { name: 'Story' } } },
      timestamp: 1738396800000,
    })

    await svc.processPending()

    const event = await WorkItemEvent.findBy('ticket_id', 'E2E-1')
    assert.isNotNull(event)
    assert.equal(event!.eventType, 'created')
  })

  test('respects the batch limit parameter', async ({ assert }) => {
    let callCount = 0
    const countCalls = async () => {
      callCount++
    }
    const svc = new EventQueueService(countCalls)

    for (let i = 0; i < 5; i++) {
      await svc.enqueue('jira', { i })
    }

    await svc.processPending(3)

    assert.equal(callCount, 3)
  })
})

// ─── queue depth check ────────────────────────────────────────────────────────

test.group('EventQueueService | queue depth', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('countPending returns number of pending rows', async ({ assert }) => {
    const svc = new EventQueueService()
    await svc.enqueue('jira', {})
    await svc.enqueue('github', {})

    const count = await svc.countPending()
    assert.equal(count, 2)
  })
})
