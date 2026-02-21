import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import WorkItemEvent from '#models/work_item_event'
import WorkItemCycle from '#models/work_item_cycle'
import StatusMapping from '#models/status_mapping'
import WorkItemCycleComputationService from '#services/work_item_cycle_computation_service'

// Jan 1–7 fixed timestamps for deterministic tests
const JAN_1 = DateTime.fromISO('2026-01-01T00:00:00.000Z')
const JAN_2 = DateTime.fromISO('2026-01-02T00:00:00.000Z')
const JAN_4 = DateTime.fromISO('2026-01-04T00:00:00.000Z')
const JAN_7 = DateTime.fromISO('2026-01-07T00:00:00.000Z')

async function createStatusMappings() {
  await StatusMapping.createMany([
    {
      jiraProjectKey: 'PAY',
      jiraStatusName: 'In BA',
      pipelineStage: 'ba',
      isActiveWork: true,
      displayOrder: 1,
    },
    {
      jiraProjectKey: 'PAY',
      jiraStatusName: 'In Dev',
      pipelineStage: 'dev',
      isActiveWork: true,
      displayOrder: 2,
    },
    {
      jiraProjectKey: 'PAY',
      jiraStatusName: 'In QA',
      pipelineStage: 'qa',
      isActiveWork: true,
      displayOrder: 3,
    },
    {
      jiraProjectKey: 'PAY',
      jiraStatusName: 'Backlog',
      pipelineStage: 'backlog',
      isActiveWork: false,
      displayOrder: 0,
    },
  ])
}

test.group('WorkItemCycleComputationService', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns null when ticket has no completed event', async ({ assert }) => {
    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-1',
      eventType: 'created',
      eventTimestamp: JAN_1,
    })

    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-1',
      eventType: 'transitioned',
      eventTimestamp: JAN_2,
      toStage: 'dev',
    })

    const service = new WorkItemCycleComputationService('PAY-1')
    const result = await service.compute()

    assert.isNull(result)
  })

  test('creates work_item_cycle with correct lead_time_days', async ({ assert }) => {
    await createStatusMappings()

    // created Jan 1, completed Jan 7 → lead_time = 6 days
    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-1',
      eventType: 'created',
      eventTimestamp: JAN_1,
    })

    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-1',
      eventType: 'transitioned',
      eventTimestamp: JAN_2,
      toStage: 'ba',
    })

    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-1',
      eventType: 'completed',
      eventTimestamp: JAN_7,
    })

    const service = new WorkItemCycleComputationService('PAY-1')
    const result = await service.compute()

    assert.isNotNull(result)
    assert.approximately(result!.leadTimeDays, 6, 0.01)
  })

  test('creates work_item_cycle with correct cycle_time_days', async ({ assert }) => {
    await createStatusMappings()

    // first_in_progress (ba) = Jan 2, completed Jan 7 → cycle_time = 5 days
    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-1',
      eventType: 'created',
      eventTimestamp: JAN_1,
    })

    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-1',
      eventType: 'transitioned',
      eventTimestamp: JAN_2,
      toStage: 'ba',
    })

    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-1',
      eventType: 'transitioned',
      eventTimestamp: JAN_4,
      toStage: 'dev',
    })

    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-1',
      eventType: 'completed',
      eventTimestamp: JAN_7,
    })

    const service = new WorkItemCycleComputationService('PAY-1')
    const result = await service.compute()

    assert.isNotNull(result)
    // first_in_progress = Jan 2 (ba is active), cycle_time = Jan 7 - Jan 2 = 5 days
    assert.approximately(result!.cycleTimeDays, 5, 0.01)
    assert.equal(result!.firstInProgress!.toISO(), JAN_2.toISO())
  })

  test('computes stage_durations correctly', async ({ assert }) => {
    await createStatusMappings()

    // ba: Jan 2 → Jan 4 = 2 days, dev: Jan 4 → Jan 7 = 3 days
    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-1',
      eventType: 'created',
      eventTimestamp: JAN_1,
    })

    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-1',
      eventType: 'transitioned',
      eventTimestamp: JAN_2,
      toStage: 'ba',
    })

    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-1',
      eventType: 'transitioned',
      eventTimestamp: JAN_4,
      toStage: 'dev',
    })

    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-1',
      eventType: 'completed',
      eventTimestamp: JAN_7,
    })

    const service = new WorkItemCycleComputationService('PAY-1')
    const result = await service.compute()

    assert.isNotNull(result)
    assert.approximately(result!.stageDurations['ba'], 2, 0.01)
    assert.approximately(result!.stageDurations['dev'], 3, 0.01)
  })

  test('computes active and wait time using status mapping is_active_work', async ({ assert }) => {
    await createStatusMappings()

    // backlog (wait) Jan 2 → Jan 4: 2 days wait
    // dev (active) Jan 4 → Jan 7: 3 days active
    // first_in_progress = Jan 4 (dev is first active stage)
    // cycle_time = Jan 7 - Jan 4 = 3 days
    // active_time = 3 days, wait_time = 2 days (backlog is before first_in_progress)
    // Actually wait_time is computed from transitions starting at first_in_progress
    // So here: only dev from first_in_progress → wait_time = 0, active_time = 3
    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-1',
      eventType: 'created',
      eventTimestamp: JAN_1,
    })

    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-1',
      eventType: 'transitioned',
      eventTimestamp: JAN_2,
      toStage: 'backlog',
    })

    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-1',
      eventType: 'transitioned',
      eventTimestamp: JAN_4,
      toStage: 'dev',
    })

    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-1',
      eventType: 'completed',
      eventTimestamp: JAN_7,
    })

    const service = new WorkItemCycleComputationService('PAY-1')
    const result = await service.compute()

    assert.isNotNull(result)
    // first_in_progress = Jan 4 (first active stage)
    assert.equal(result!.firstInProgress!.toISO(), JAN_4.toISO())
    // cycle_time = Jan 7 - Jan 4 = 3 days
    assert.approximately(result!.cycleTimeDays, 3, 0.01)
    // active_time = 3 days (only dev stage, starting from first_in_progress)
    assert.approximately(result!.activeTimeDays, 3, 0.01)
    // wait_time = 0 (backlog is before first_in_progress, excluded from stage_durations)
    assert.approximately(result!.waitTimeDays, 0, 0.01)
    // flow_efficiency = 100%
    assert.approximately(result!.flowEfficiencyPct, 100, 0.01)
    // stage_durations only includes stages from first_in_progress onwards
    assert.isUndefined(result!.stageDurations['backlog'])
    assert.approximately(result!.stageDurations['dev'], 3, 0.01)
  })

  test('computes flow_efficiency_pct correctly for mixed active/wait stages', async ({
    assert,
  }) => {
    // Create a 'qa' stage with is_active_work=false to test wait time within cycle
    await StatusMapping.createMany([
      {
        jiraProjectKey: 'PAY',
        jiraStatusName: 'In Dev',
        pipelineStage: 'dev',
        isActiveWork: true,
        displayOrder: 1,
      },
      {
        jiraProjectKey: 'PAY',
        jiraStatusName: 'QA Queue',
        pipelineStage: 'qa',
        isActiveWork: false,
        displayOrder: 2,
      },
    ])

    // dev (active) Jan 2 → Jan 4: 2 days (first_in_progress = Jan 2)
    // qa (wait)  Jan 4 → Jan 7: 3 days
    // cycle_time = Jan 2 → Jan 7 = 5 days
    // active_time = 2 days, wait_time = 3 days
    // flow_efficiency = 2/5 * 100 = 40%
    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-1',
      eventType: 'created',
      eventTimestamp: JAN_1,
    })

    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-1',
      eventType: 'transitioned',
      eventTimestamp: JAN_2,
      toStage: 'dev',
    })

    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-1',
      eventType: 'transitioned',
      eventTimestamp: JAN_4,
      toStage: 'qa',
    })

    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-1',
      eventType: 'completed',
      eventTimestamp: JAN_7,
    })

    const service = new WorkItemCycleComputationService('PAY-1')
    const result = await service.compute()

    assert.isNotNull(result)
    assert.approximately(result!.activeTimeDays, 2, 0.01)
    assert.approximately(result!.waitTimeDays, 3, 0.01)
    assert.approximately(result!.flowEfficiencyPct, 40, 0.01)
  })

  test('updates existing work_item_cycle record if one already exists', async ({ assert }) => {
    await createStatusMappings()

    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-1',
      eventType: 'created',
      eventTimestamp: JAN_1,
    })

    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-1',
      eventType: 'transitioned',
      eventTimestamp: JAN_2,
      toStage: 'ba',
    })

    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-1',
      eventType: 'completed',
      eventTimestamp: JAN_7,
    })

    const service = new WorkItemCycleComputationService('PAY-1')
    await service.compute()
    await service.compute() // second call should update, not duplicate

    const count = await WorkItemCycle.query().where('ticket_id', 'PAY-1').count('* as total')
    assert.equal(Number(count[0].$extras.total), 1)
  })

  test('uses first transition timestamp as createdAtSource when no created event exists', async ({
    assert,
  }) => {
    await createStatusMappings()

    // No 'created' event — createdAtSource falls back to transitions[0].eventTimestamp
    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-1',
      eventType: 'transitioned',
      eventTimestamp: JAN_2,
      toStage: 'ba',
    })

    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-1',
      eventType: 'completed',
      eventTimestamp: JAN_7,
    })

    const service = new WorkItemCycleComputationService('PAY-1')
    const result = await service.compute()

    assert.isNotNull(result)
    assert.equal(result!.createdAtSource.toISO(), JAN_2.toISO())
  })

  test('uses completedAt as createdAtSource when no created or transitioned events exist', async ({
    assert,
  }) => {
    // Only a completed event — both createdEvent and transitions[0] are undefined
    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-1',
      eventType: 'completed',
      eventTimestamp: JAN_7,
    })

    const service = new WorkItemCycleComputationService('PAY-1')
    const result = await service.compute()

    assert.isNotNull(result)
    // createdAtSource falls back to completedAt
    assert.equal(result!.createdAtSource.toISO(), JAN_7.toISO())
    assert.approximately(result!.leadTimeDays, 0, 0.001)
  })

  test('handles ticket with completed event but no transitions', async ({ assert }) => {
    // No transitions → stages.length=0 → activeStages=empty set → firstInProgress=null
    // cycleTimeDays=0, flowEfficiencyPct=0, stageDurations={}
    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-1',
      eventType: 'created',
      eventTimestamp: JAN_1,
    })

    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-1',
      eventType: 'completed',
      eventTimestamp: JAN_7,
    })

    const service = new WorkItemCycleComputationService('PAY-1')
    const result = await service.compute()

    assert.isNotNull(result)
    assert.isNull(result!.firstInProgress)
    assert.approximately(result!.cycleTimeDays, 0, 0.001)
    assert.approximately(result!.flowEfficiencyPct, 0, 0.001)
    assert.deepEqual(result!.stageDurations, {})
    // lead_time still computed from created → completed = 6 days
    assert.approximately(result!.leadTimeDays, 6, 0.01)
  })

  test('sets created_at_source from the created event timestamp', async ({ assert }) => {
    await createStatusMappings()

    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-1',
      eventType: 'created',
      eventTimestamp: JAN_1,
    })

    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-1',
      eventType: 'transitioned',
      eventTimestamp: JAN_2,
      toStage: 'ba',
    })

    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-1',
      eventType: 'completed',
      eventTimestamp: JAN_7,
    })

    const service = new WorkItemCycleComputationService('PAY-1')
    const result = await service.compute()

    assert.isNotNull(result)
    assert.equal(result!.createdAtSource.toISO(), JAN_1.toISO())
  })
})
