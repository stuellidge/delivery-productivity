import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import WorkItemEvent from '#models/work_item_event'
import WorkItemCycle from '#models/work_item_cycle'
import StatusMapping from '#models/status_mapping'
import DeliveryStream from '#models/delivery_stream'
import Sprint from '#models/sprint'
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
    // Jan 1 (Thu) 00:00 → Jan 7 (Wed) 00:00 = 4 elapsed business days (Thu+Fri+Mon+Tue)
    assert.approximately(result!.leadTimeDays, 4, 0.01)
  })

  test('creates work_item_cycle with correct cycle_time_days', async ({ assert }) => {
    await createStatusMappings()

    // first_in_progress (ba) = Jan 2 (Fri), completed Jan 7 (Wed) → cycle_time = 4 business days
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
    // first_in_progress = Jan 2 (ba is active)
    // Jan 2 (Fri) 00:00 → Jan 7 (Wed) 00:00 = 3 elapsed business days (Fri+Mon+Tue)
    assert.approximately(result!.cycleTimeDays, 3, 0.01)
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
    // ba: Jan 2 (Fri) → Jan 4 (Sun) = 1 business day (Fri only)
    assert.approximately(result!.stageDurations['ba'], 1, 0.01)
    // dev: Jan 4 (Sun) → Jan 7 (Wed) = 2 business days (Mon, Tue)
    assert.approximately(result!.stageDurations['dev'], 2, 0.01)
  })

  test('computes active and wait time using status mapping is_active_work', async ({ assert }) => {
    await createStatusMappings()

    // backlog (wait) Jan 2 → Jan 4: before first_in_progress, excluded
    // dev (active) Jan 4 → Jan 7: 2 business days (Mon, Tue)
    // first_in_progress = Jan 4 (dev is first active stage)
    // cycle_time = Jan 4 (Sun) → Jan 7 (Wed) = 2 business days (Mon, Tue)
    // active_time = 2 days, wait_time = 0 (backlog is before first_in_progress)
    // So here: only dev from first_in_progress → wait_time = 0, active_time = 2
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
    // cycle_time = Jan 4 (Sun) → Jan 7 (Wed) = 2 business days (Mon, Tue)
    assert.approximately(result!.cycleTimeDays, 2, 0.01)
    // active_time = 2 days (only dev stage, starting from first_in_progress)
    assert.approximately(result!.activeTimeDays, 2, 0.01)
    // wait_time = 0 (backlog is before first_in_progress, excluded from stage_durations)
    assert.approximately(result!.waitTimeDays, 0, 0.01)
    // flow_efficiency = 100%
    assert.approximately(result!.flowEfficiencyPct, 100, 0.01)
    // stage_durations only includes stages from first_in_progress onwards
    assert.isUndefined(result!.stageDurations['backlog'])
    assert.approximately(result!.stageDurations['dev'], 2, 0.01)
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

    // dev (active) Jan 2 (Fri) → Jan 4 (Sun) = 1 business day (first_in_progress = Jan 2)
    // qa (wait)  Jan 4 (Sun) → Jan 7 (Wed) = 2 business days (Mon, Tue)
    // cycle_time = Jan 2 → Jan 7 = 3 business days (Fri, Mon, Tue)
    // active_time = 1 day, wait_time = 2 days
    // flow_efficiency = 1/3 * 100 = 33.33%
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
    // dev (active): Jan 2 (Fri) → Jan 4 (Sun) = 1 business day
    assert.approximately(result!.activeTimeDays, 1, 0.01)
    // qa (wait): Jan 4 (Sun) → Jan 7 (Wed) = 2 business days (Mon, Tue)
    assert.approximately(result!.waitTimeDays, 2, 0.01)
    // cycle_time: Jan 2 (Fri) → Jan 7 (Wed) = 3 business days; flow_efficiency = 1/3 * 100 = 33.33%
    assert.approximately(result!.flowEfficiencyPct, 33.33, 0.01)
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
    // lead_time: Jan 1 (Thu) → Jan 7 (Wed) = 4 business days (Thu+Fri+Mon+Tue)
    assert.approximately(result!.leadTimeDays, 4, 0.01)
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

test.group('WorkItemCycleComputationService | sprint assignment', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('populates sprintId when completedAt falls within a sprint', async ({ assert }) => {
    const ds = await DeliveryStream.create({
      name: 'wic-sprint-ds',
      displayName: 'WIC Sprint DS',
      isActive: true,
    })

    const sprint = await Sprint.create({
      jiraSprintId: 'sprint-wic-1',
      deliveryStreamId: ds.id,
      name: 'Sprint 1',
      startDate: '2026-01-01',
      endDate: '2026-01-14',
      state: 'closed',
    })

    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-1',
      eventType: 'created',
      deliveryStreamId: ds.id,
      eventTimestamp: JAN_1,
    })

    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-1',
      eventType: 'completed',
      deliveryStreamId: ds.id,
      eventTimestamp: JAN_7,
    })

    const result = await new WorkItemCycleComputationService('PAY-1').compute()

    assert.isNotNull(result)
    assert.equal(result!.sprintId, sprint.id)
  })

  test('sprintId is null when no sprint contains completedAt', async ({ assert }) => {
    const ds = await DeliveryStream.create({
      name: 'wic-sprint-ds-2',
      displayName: 'WIC Sprint DS 2',
      isActive: true,
    })

    // Sprint ends before completedAt
    await Sprint.create({
      jiraSprintId: 'sprint-wic-2',
      deliveryStreamId: ds.id,
      name: 'Sprint 2',
      startDate: '2025-12-01',
      endDate: '2025-12-31',
      state: 'closed',
    })

    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-2',
      eventType: 'created',
      deliveryStreamId: ds.id,
      eventTimestamp: JAN_1,
    })

    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-2',
      eventType: 'completed',
      deliveryStreamId: ds.id,
      eventTimestamp: JAN_7,
    })

    const result = await new WorkItemCycleComputationService('PAY-2').compute()

    assert.isNotNull(result)
    assert.isNull(result!.sprintId)
  })

  test('sprintId is null when deliveryStreamId is null', async ({ assert }) => {
    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-3',
      eventType: 'created',
      eventTimestamp: JAN_1,
    })

    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-3',
      eventType: 'completed',
      eventTimestamp: JAN_7,
    })

    const result = await new WorkItemCycleComputationService('PAY-3').compute()

    assert.isNotNull(result)
    assert.isNull(result!.sprintId)
  })
})
