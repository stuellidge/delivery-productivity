import { test } from '@japa/runner'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { DateTime } from 'luxon'
import EventArchiveService from '#services/event_archive_service'

test.group('EventArchiveService', (group) => {
  let tmpPath: string

  group.setup(() => {
    tmpPath = join(tmpdir(), `archive-test-${Date.now()}`)
  })

  group.teardown(async () => {
    if (existsSync(tmpPath)) {
      await rm(tmpPath, { recursive: true })
    }
  })

  test('creates JSONL file in event-type subdirectory with correct date name', async ({
    assert,
  }) => {
    const svc = new EventArchiveService(tmpPath)
    await svc.append('work_item_events', { ticketId: 'PAY-1', eventType: 'created' })

    const date = DateTime.now().toISODate()!
    const filePath = join(tmpPath, 'work_item_events', `${date}.jsonl`)
    assert.isTrue(existsSync(filePath))
  })

  test('file contains valid JSON with all provided data fields', async ({ assert }) => {
    const svc = new EventArchiveService(tmpPath)
    await svc.append('pr_events', { prNumber: 42, eventType: 'opened' })

    const date = DateTime.now().toISODate()!
    const content = await readFile(join(tmpPath, 'pr_events', `${date}.jsonl`), 'utf-8')
    const parsed = JSON.parse(content.trim())

    assert.equal(parsed.prNumber, 42)
    assert.equal(parsed.eventType, 'opened')
  })

  test('includes _archived_at ISO timestamp in each line', async ({ assert }) => {
    const svc = new EventArchiveService(tmpPath)
    await svc.append('cicd_events', { id: 1 })

    const date = DateTime.now().toISODate()!
    const content = await readFile(join(tmpPath, 'cicd_events', `${date}.jsonl`), 'utf-8')
    const parsed = JSON.parse(content.trim())

    assert.isString(parsed._archived_at)
    assert.match(parsed._archived_at, /^\d{4}-\d{2}-\d{2}T/)
  })

  test('multiple appends accumulate as separate lines in same file', async ({ assert }) => {
    const svc = new EventArchiveService(tmpPath)
    await svc.append('incident_events', { id: 1 })
    await svc.append('incident_events', { id: 2 })
    await svc.append('incident_events', { id: 3 })

    const date = DateTime.now().toISODate()!
    const content = await readFile(join(tmpPath, 'incident_events', `${date}.jsonl`), 'utf-8')
    const lines = content.trim().split('\n').filter(Boolean)

    assert.equal(lines.length, 3)
    assert.equal(JSON.parse(lines[0]).id, 1)
    assert.equal(JSON.parse(lines[1]).id, 2)
    assert.equal(JSON.parse(lines[2]).id, 3)
  })

  test('uses separate subdirectory for each event type', async ({ assert }) => {
    const svc = new EventArchiveService(tmpPath)
    await svc.append('work_item_events', { ticketId: 'A-1' })
    await svc.append('pr_events', { prNumber: 1 })

    const date = DateTime.now().toISODate()!
    assert.isTrue(existsSync(join(tmpPath, 'work_item_events', `${date}.jsonl`)))
    assert.isTrue(existsSync(join(tmpPath, 'pr_events', `${date}.jsonl`)))
    assert.isFalse(existsSync(join(tmpPath, 'work_item_events', 'pr_events')))
  })

  test('creates archive directory if it does not exist', async ({ assert }) => {
    const nestedPath = join(tmpPath, 'nested', 'deep')
    const svc = new EventArchiveService(nestedPath)
    await svc.append('deployment_records', { id: 1 })

    assert.isTrue(existsSync(join(nestedPath, 'deployment_records')))
  })

  test('lastWriteTime returns null when archive directory does not exist', async ({ assert }) => {
    const svc = new EventArchiveService(join(tmpPath, 'nonexistent'))
    const result = await svc.lastWriteTime()
    assert.isNull(result)
  })

  test('lastWriteTime returns a DateTime after writing', async ({ assert }) => {
    const svc = new EventArchiveService(tmpPath)
    await svc.append('pulse_responses', { id: 1 })

    const result = await svc.lastWriteTime()
    assert.isNotNull(result)
    assert.isTrue(result!.isValid)
  })
})
