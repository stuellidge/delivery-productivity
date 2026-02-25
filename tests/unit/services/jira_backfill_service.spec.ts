import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import WorkItemEvent from '#models/work_item_event'
import WorkItemCycle from '#models/work_item_cycle'
import StatusMapping from '#models/status_mapping'
import JiraBackfillService from '#services/jira_backfill_service'

let originalFetch: typeof globalThis.fetch

function buildSearchResponse(issues: any[], total?: number) {
  return {
    issues,
    total: total ?? issues.length,
    startAt: 0,
    maxResults: 100,
  }
}

function buildIssue(
  key: string,
  opts: {
    status?: string
    issuetype?: string
    created?: string
    updated?: string
    changelogHistories?: any[]
    deliveryStream?: string
  } = {}
) {
  return {
    key,
    fields: {
      status: { name: opts.status ?? 'In Progress' },
      issuetype: { name: opts.issuetype ?? 'Story' },
      created: opts.created ?? '2026-01-10T10:00:00.000+0000',
      updated: opts.updated ?? '2026-01-15T10:00:00.000+0000',
      customfield_delivery_stream: opts.deliveryStream,
    },
    changelog: {
      histories: opts.changelogHistories ?? [],
    },
  }
}

function mockFetchOnce(response: any) {
  globalThis.fetch = async () => ({ ok: true, json: async () => response }) as Response
}

test.group('JiraBackfillService | run', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())
  group.each.setup(() => {
    originalFetch = globalThis.fetch
    process.env.JIRA_BASE_URL = 'https://jira.example.com'
    process.env.JIRA_API_TOKEN = 'test-token'
    process.env.JIRA_EMAIL = 'user@example.com'
  })
  group.each.teardown(() => {
    globalThis.fetch = originalFetch
  })

  test('creates created WorkItemEvent for each issue', async ({ assert }) => {
    mockFetchOnce(buildSearchResponse([buildIssue('PAY-1')]))

    await new JiraBackfillService('PAY').run()

    const event = await WorkItemEvent.query()
      .where('ticket_id', 'PAY-1')
      .where('event_type', 'created')
      .first()

    assert.isNotNull(event)
    assert.equal(event!.source, 'jira')
    assert.equal(event!.ticketType, 'Story')
  })

  test('is idempotent — duplicate run does not create duplicate events', async ({ assert }) => {
    const issue = buildIssue('PAY-2')
    const response = buildSearchResponse([issue])
    globalThis.fetch = async () => ({ ok: true, json: async () => response }) as Response

    await new JiraBackfillService('PAY').run()
    await new JiraBackfillService('PAY').run()

    const rows = await WorkItemEvent.query()
      .where('ticket_id', 'PAY-2')
      .where('event_type', 'created')

    assert.equal(rows.length, 1)
  })

  test('creates transitioned WorkItemEvent for status changelog histories', async ({ assert }) => {
    await StatusMapping.create({
      jiraProjectKey: 'PAY',
      jiraStatusName: 'In Progress',
      pipelineStage: 'dev',
      isActiveWork: true,
      displayOrder: 1,
    })

    const issue = buildIssue('PAY-3', {
      changelogHistories: [
        {
          created: '2026-01-11T09:00:00.000+0000',
          items: [{ field: 'status', fromString: 'To Do', toString: 'In Progress' }],
        },
      ],
    })
    mockFetchOnce(buildSearchResponse([issue]))

    await new JiraBackfillService('PAY').run()

    const event = await WorkItemEvent.query()
      .where('ticket_id', 'PAY-3')
      .where('event_type', 'transitioned')
      .first()

    assert.isNotNull(event)
    assert.equal(event!.toStage, 'dev')
  })

  test('paginates until all issues are fetched', async ({ assert }) => {
    const page1 = buildIssue('PAY-10')
    const page2 = buildIssue('PAY-11')

    globalThis.fetch = async (url: any) => {
      const urlStr = String(url)
      if (urlStr.includes('startAt=0')) {
        return {
          ok: true,
          json: async () => ({ issues: [page1], total: 2, startAt: 0, maxResults: 100 }),
        } as Response
      }
      return {
        ok: true,
        json: async () => ({ issues: [page2], total: 2, startAt: 1, maxResults: 100 }),
      } as Response
    }

    await new JiraBackfillService('PAY').run()

    const events = await WorkItemEvent.query().whereIn('ticket_id', ['PAY-10', 'PAY-11'])
    assert.equal(events.length, 2)
  })

  test('does nothing when JIRA env vars are not configured', async ({ assert }) => {
    delete process.env.JIRA_BASE_URL
    delete process.env.JIRA_API_TOKEN
    delete process.env.JIRA_EMAIL

    let fetchCalled = false
    globalThis.fetch = async () => {
      fetchCalled = true
      return { ok: true, json: async () => buildSearchResponse([]) } as Response
    }

    await new JiraBackfillService('PAY').run()

    assert.isFalse(fetchCalled)
    const count = await WorkItemEvent.query().count('* as total')
    assert.equal(Number(count[0].$extras.total), 0)
  })

  test('creates work_item_cycle for issues in a completed stage after backfill', async ({
    assert,
  }) => {
    await StatusMapping.create({
      jiraProjectKey: 'PAY',
      jiraStatusName: 'Done',
      pipelineStage: 'done',
      isActiveWork: false,
      displayOrder: 99,
    })

    const issue = buildIssue('PAY-20', {
      status: 'Done',
      updated: '2026-01-20T10:00:00.000+0000',
    })
    mockFetchOnce(buildSearchResponse([issue]))

    await new JiraBackfillService('PAY').run()

    const cycle = await WorkItemCycle.findBy('ticket_id', 'PAY-20')
    assert.isNotNull(cycle)
  })

  test('does not fail for in-progress issues (compute returns null gracefully)', async ({
    assert,
  }) => {
    const issue = buildIssue('PAY-21', { status: 'In Progress' })
    mockFetchOnce(buildSearchResponse([issue]))

    // No StatusMapping for 'In Progress' — resolveStage returns null → no completed event → compute() returns null
    await new JiraBackfillService('PAY').run()

    const cycles = await WorkItemCycle.all()
    assert.equal(cycles.length, 0)
  })
})
