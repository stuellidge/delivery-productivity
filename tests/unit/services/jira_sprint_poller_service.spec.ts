import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import Sprint from '#models/sprint'
import SprintSnapshot from '#models/sprint_snapshot'
import StatusMapping from '#models/status_mapping'
import DeliveryStream from '#models/delivery_stream'
import JiraSprintPollerService from '#services/jira_sprint_poller_service'

let originalFetch: typeof globalThis.fetch

function mockFetchPages(pages: any[]) {
  let callCount = 0
  globalThis.fetch = async () => {
    const page = pages[callCount] ?? pages[pages.length - 1]
    callCount++
    return { ok: true, json: async () => page } as Response
  }
}

function mockFetchError(status = 500) {
  globalThis.fetch = async () => ({ ok: false, status, json: async () => ({}) }) as Response
}

function buildSprintIssues(issues: Array<{ key: string; statusName: string }>, total?: number) {
  return {
    issues: issues.map((i) => ({
      key: i.key,
      fields: { status: { name: i.statusName } },
    })),
    total: total ?? issues.length,
  }
}

async function createSprint(
  opts: {
    jiraSprintId?: string
    state?: 'future' | 'active' | 'closed'
    deliveryStreamId?: number | null
  } = {}
) {
  return Sprint.create({
    jiraSprintId: opts.jiraSprintId ?? 'SP-1',
    name: 'Sprint 1',
    startDate: DateTime.now().minus({ days: 3 }).toISODate()!,
    endDate: DateTime.now().plus({ days: 7 }).toISODate()!,
    state: opts.state ?? 'active',
    deliveryStreamId: opts.deliveryStreamId ?? null,
  })
}

async function createStatusMapping(projectKey: string, statusName: string, pipelineStage: string) {
  return StatusMapping.create({
    jiraProjectKey: projectKey,
    jiraStatusName: statusName,
    pipelineStage: pipelineStage as any,
    isActiveWork: true,
    displayOrder: 1,
  })
}

test.group('JiraSprintPollerService | run', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())
  group.each.setup(() => {
    originalFetch = globalThis.fetch
    process.env.JIRA_BASE_URL = 'https://jira.example.com'
    process.env.JIRA_API_TOKEN = 'test-token'
    process.env.JIRA_EMAIL = 'svc@example.com'
  })
  group.each.teardown(() => {
    globalThis.fetch = originalFetch
    delete process.env.JIRA_BASE_URL
    delete process.env.JIRA_API_TOKEN
    delete process.env.JIRA_EMAIL
  })

  test('does nothing when no active sprints exist', async ({ assert }) => {
    await createSprint({ state: 'closed' })
    mockFetchPages([buildSprintIssues([])])

    const service = new JiraSprintPollerService()
    await service.run()

    const snapshots = await SprintSnapshot.all()
    assert.lengthOf(snapshots, 0)
  })

  test('creates a snapshot for each active sprint', async ({ assert }) => {
    const ds = await DeliveryStream.create({
      name: 'payments',
      displayName: 'Payments',
      isActive: true,
    })
    const sprint = await createSprint({ deliveryStreamId: ds.id })
    mockFetchPages([buildSprintIssues([])])

    await new JiraSprintPollerService().run()

    const snapshots = await SprintSnapshot.query().where('sprint_id', sprint.id)
    assert.lengthOf(snapshots, 1)
    assert.equal(snapshots[0].snapshotDate, DateTime.now().toISODate()!)
    assert.equal(snapshots[0].source, 'jira')
    assert.equal(snapshots[0].deliveryStreamId, ds.id)
  })

  test('counts committed, completed, remaining correctly', async ({ assert }) => {
    const sprint = await createSprint()
    await createStatusMapping('PAY', 'In Progress', 'dev')
    await createStatusMapping('PAY', 'Done', 'done')
    await createStatusMapping('PAY', 'In QA', 'qa')

    const issues = [
      { key: 'PAY-1', statusName: 'In Progress' },
      { key: 'PAY-2', statusName: 'Done' },
      { key: 'PAY-3', statusName: 'Done' },
      { key: 'PAY-4', statusName: 'In QA' },
    ]
    mockFetchPages([buildSprintIssues(issues)])

    await new JiraSprintPollerService().run()

    const snap = await SprintSnapshot.query().where('sprint_id', sprint.id).firstOrFail()
    assert.equal(snap.committedCount, 4)
    assert.equal(snap.completedCount, 2)
    assert.equal(snap.remainingCount, 2)
  })

  test('counts WIP by stage (ba, dev, qa, uat)', async ({ assert }) => {
    const sprint = await createSprint()
    await createStatusMapping('PAY', 'In Analysis', 'ba')
    await createStatusMapping('PAY', 'In Progress', 'dev')
    await createStatusMapping('PAY', 'In Code Review', 'code_review')
    await createStatusMapping('PAY', 'In QA', 'qa')
    await createStatusMapping('PAY', 'In UAT', 'uat')
    await createStatusMapping('PAY', 'Done', 'done')

    const issues = [
      { key: 'PAY-1', statusName: 'In Analysis' },
      { key: 'PAY-2', statusName: 'In Progress' },
      { key: 'PAY-3', statusName: 'In Code Review' },
      { key: 'PAY-4', statusName: 'In QA' },
      { key: 'PAY-5', statusName: 'In UAT' },
      { key: 'PAY-6', statusName: 'Done' },
    ]
    mockFetchPages([buildSprintIssues(issues)])

    await new JiraSprintPollerService().run()

    const snap = await SprintSnapshot.query().where('sprint_id', sprint.id).firstOrFail()
    assert.equal(snap.wipBa, 1)
    assert.equal(snap.wipDev, 2) // dev + code_review
    assert.equal(snap.wipQa, 1)
    assert.equal(snap.wipUat, 1)
  })

  test('upserts snapshot — rerunning on same day overwrites previous', async ({ assert }) => {
    const sprint = await createSprint()
    await createStatusMapping('PAY', 'Done', 'done')

    // First run: 3 items, 1 done
    mockFetchPages([
      buildSprintIssues([
        { key: 'PAY-1', statusName: 'To Do' },
        { key: 'PAY-2', statusName: 'Done' },
        { key: 'PAY-3', statusName: 'To Do' },
      ]),
    ])
    await new JiraSprintPollerService().run()

    // Second run: 3 items, 2 done
    mockFetchPages([
      buildSprintIssues([
        { key: 'PAY-1', statusName: 'To Do' },
        { key: 'PAY-2', statusName: 'Done' },
        { key: 'PAY-3', statusName: 'Done' },
      ]),
    ])
    await new JiraSprintPollerService().run()

    const snaps = await SprintSnapshot.query().where('sprint_id', sprint.id)
    assert.lengthOf(snaps, 1, 'should have only one snapshot (upserted)')
    assert.equal(snaps[0].completedCount, 2)
    assert.equal(snaps[0].remainingCount, 1)
  })

  test('paginates Jira API when there are more issues than maxResults', async ({ assert }) => {
    const sprint = await createSprint()
    await createStatusMapping('PAY', 'Done', 'done')

    const page1 = {
      issues: Array.from({ length: 100 }, (_, i) => ({
        key: `PAY-${i + 1}`,
        fields: { status: { name: 'Done' } },
      })),
      total: 150,
    }
    const page2 = {
      issues: Array.from({ length: 50 }, (_, i) => ({
        key: `PAY-${i + 101}`,
        fields: { status: { name: 'Done' } },
      })),
      total: 150,
    }
    mockFetchPages([page1, page2])

    await new JiraSprintPollerService().run()

    const snap = await SprintSnapshot.query().where('sprint_id', sprint.id).firstOrFail()
    assert.equal(snap.committedCount, 150)
    assert.equal(snap.completedCount, 150)
  })

  test('skips sprint and logs error when Jira API returns non-ok', async ({ assert }) => {
    await createSprint()
    mockFetchError(500)

    // Should not throw — just logs the error and skips
    await new JiraSprintPollerService().run()

    const snapshots = await SprintSnapshot.all()
    assert.lengthOf(snapshots, 0)
  })

  test('does nothing and logs warning when Jira env vars are not set', async ({ assert }) => {
    delete process.env.JIRA_BASE_URL
    delete process.env.JIRA_API_TOKEN
    delete process.env.JIRA_EMAIL

    await createSprint()

    let fetchCalled = false
    globalThis.fetch = async () => {
      fetchCalled = true
      return { ok: true, json: async () => ({ issues: [], total: 0 }) } as Response
    }

    await new JiraSprintPollerService().run()

    assert.isFalse(fetchCalled)
    assert.lengthOf(await SprintSnapshot.all(), 0)
  })

  test('only polls active sprints (ignores future and closed)', async ({ assert }) => {
    await createSprint({ jiraSprintId: 'SP-FUTURE', state: 'future' })
    await createSprint({ jiraSprintId: 'SP-CLOSED', state: 'closed' })

    let callCount = 0
    globalThis.fetch = async () => {
      callCount++
      return { ok: true, json: async () => ({ issues: [], total: 0 }) } as Response
    }

    await new JiraSprintPollerService().run()

    assert.equal(callCount, 0)
    assert.lengthOf(await SprintSnapshot.all(), 0)
  })
})
