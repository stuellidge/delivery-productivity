import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { DateTime } from 'luxon'
import WorkItemEvent from '#models/work_item_event'
import WorkItemCycle from '#models/work_item_cycle'
import DeliveryStream from '#models/delivery_stream'
import Sprint from '#models/sprint'

/**
 * Seeds work item events (transitions) and completed work item cycles.
 * Produces realistic WIP distribution and cycle time data for the dashboard.
 * Development environment only — will not run in test or production.
 */
export default class WorkItemsSeeder extends BaseSeeder {
  static environment = ['development']

  async run() {
    const payments = await DeliveryStream.findByOrFail('name', 'payments')
    const search = await DeliveryStream.findByOrFail('name', 'search')

    const now = DateTime.now()

    // Fetch active sprints
    const payActiveSprint = await Sprint.query()
      .where('delivery_stream_id', payments.id)
      .where('state', 'active')
      .first()

    const srcActiveSprint = await Sprint.query()
      .where('delivery_stream_id', search.id)
      .where('state', 'active')
      .first()

    const payClosedSprints = await Sprint.query()
      .where('delivery_stream_id', payments.id)
      .where('state', 'closed')
      .orderBy('start_date', 'asc')

    const srcClosedSprints = await Sprint.query()
      .where('delivery_stream_id', search.id)
      .where('state', 'closed')
      .orderBy('start_date', 'asc')

    // ─── Completed Payments tickets ───────────────────────────────────────────
    // 25 tickets over the last 60 days — mix of story points and cycle times

    const payCompletedTickets = [
      // [ticketId, daysAgo (completed), cycleTimeDays, storyPoints, sprint index (0=oldest closed)]
      ['PAY-101', 58, 6.2, 3, 0],
      ['PAY-102', 55, 2.1, 1, 0],
      ['PAY-103', 51, 8.5, 5, 0],
      ['PAY-104', 48, 3.0, 2, 0],
      ['PAY-105', 44, 1.8, 1, 0],
      ['PAY-106', 40, 4.5, 3, 0],
      ['PAY-107', 37, 2.8, 2, 1],
      ['PAY-108', 34, 5.1, 3, 1],
      ['PAY-109', 30, 7.3, 5, 1],
      ['PAY-110', 27, 1.5, 1, 1],
      ['PAY-111', 24, 3.2, 2, 1],
      ['PAY-112', 22, 2.0, 1, 1],
      ['PAY-113', 20, 4.8, 3, 1],
      ['PAY-114', 18, 6.9, 5, 2],
      ['PAY-115', 16, 2.5, 2, 2],
      ['PAY-116', 14, 1.2, 1, 2],
      ['PAY-117', 12, 3.8, 3, 2],
      ['PAY-118', 10, 2.2, 2, 2],
      ['PAY-119', 8, 4.1, 3, 2],
      ['PAY-120', 7, 1.9, 1, 2],
      ['PAY-121', 6, 5.5, 5, 2],
      ['PAY-122', 5, 2.7, 2, 3],
      ['PAY-123', 4, 1.4, 1, 3],
      ['PAY-124', 3, 3.3, 3, 3],
      ['PAY-125', 2, 2.0, 2, 3],
    ] as [string, number, number, number, number][]

    for (const [ticketId, daysAgo, cycleTimeDays, storyPoints, sprintIdx] of payCompletedTickets) {
      const completedAt = now.minus({ days: daysAgo })
      const startedAt = completedAt.minus({ days: cycleTimeDays })
      const sprint = payClosedSprints[sprintIdx] ?? payClosedSprints[payClosedSprints.length - 1]

      // active time ≈ 45% of total cycle (rest is wait/queue)
      const activeTimeDays = cycleTimeDays * 0.45
      const waitTimeDays = cycleTimeDays * 0.55
      const stageDurations = {
        ba: Math.round(cycleTimeDays * 0.1 * 10) / 10,
        dev: Math.round(cycleTimeDays * 0.5 * 10) / 10,
        code_review: Math.round(cycleTimeDays * 0.25 * 10) / 10,
        qa: Math.round(cycleTimeDays * 0.15 * 10) / 10,
      }

      const existingCycle = await WorkItemCycle.findBy('ticket_id', ticketId)
      if (!existingCycle) {
        await WorkItemCycle.create({
          ticketId,
          deliveryStreamId: payments.id,
          techStreamIds: null,
          ticketType: storyPoints >= 5 ? 'Story' : 'Task',
          storyPoints,
          createdAtSource: startedAt.minus({ days: 1 }),
          firstInProgress: startedAt,
          completedAt,
          leadTimeDays: cycleTimeDays + 1,
          cycleTimeDays,
          activeTimeDays,
          waitTimeDays,
          flowEfficiencyPct: (activeTimeDays / cycleTimeDays) * 100,
          stageDurations,
          sprintId: sprint?.id ?? null,
        })
      }

      // Create work item events for this ticket
      const existingEvent = await WorkItemEvent.query().where('ticket_id', ticketId).first()
      if (!existingEvent) {
        const rcvd = { receivedAt: startedAt }
        await WorkItemEvent.createMany([
          {
            source: 'jira',
            ticketId,
            eventType: 'created',
            deliveryStreamId: payments.id,
            toStage: 'backlog',
            fromStage: null,
            storyPoints,
            sprintId: sprint?.id ?? null,
            ticketType: storyPoints >= 5 ? 'Story' : 'Task',
            eventTimestamp: startedAt.minus({ days: 1 }),
            ...rcvd,
          },
          {
            source: 'jira',
            ticketId,
            eventType: 'transitioned',
            deliveryStreamId: payments.id,
            fromStage: 'backlog',
            toStage: 'dev',
            storyPoints,
            eventTimestamp: startedAt,
            ...rcvd,
          },
          {
            source: 'jira',
            ticketId,
            eventType: 'transitioned',
            deliveryStreamId: payments.id,
            fromStage: 'dev',
            toStage: 'code_review',
            storyPoints,
            eventTimestamp: startedAt.plus({ days: cycleTimeDays * 0.6 }),
            ...rcvd,
          },
          {
            source: 'jira',
            ticketId,
            eventType: 'completed',
            deliveryStreamId: payments.id,
            fromStage: 'code_review',
            toStage: 'done',
            storyPoints,
            eventTimestamp: completedAt,
            ...rcvd,
          },
        ])
      }
    }

    // ─── Active Payments WIP items ─────────────────────────────────────────────
    const payWipTickets: [string, string, number][] = [
      // [ticketId, currentStage, daysInProgress]
      ['PAY-201', 'ba', 1],
      ['PAY-202', 'dev', 3],
      ['PAY-203', 'dev', 2],
      ['PAY-204', 'dev', 5],
      ['PAY-205', 'code_review', 1],
      ['PAY-206', 'code_review', 2],
      ['PAY-207', 'qa', 1],
      ['PAY-208', 'qa', 3],
    ]

    for (const [ticketId, stage, daysIn] of payWipTickets) {
      const existingEvent = await WorkItemEvent.query().where('ticket_id', ticketId).first()
      if (!existingEvent) {
        const startedAt = now.minus({ days: daysIn + 1 })
        await WorkItemEvent.createMany([
          {
            source: 'jira',
            ticketId,
            eventType: 'created',
            deliveryStreamId: payments.id,
            toStage: 'backlog',
            fromStage: null,
            storyPoints: 2,
            eventTimestamp: startedAt.minus({ hours: 4 }),
            receivedAt: startedAt.minus({ hours: 4 }),
            sprintId: payActiveSprint?.id ?? null,
          },
          {
            source: 'jira',
            ticketId,
            eventType: 'transitioned',
            deliveryStreamId: payments.id,
            fromStage: 'backlog',
            toStage: stage as any,
            storyPoints: 2,
            eventTimestamp: startedAt,
            receivedAt: startedAt,
            sprintId: payActiveSprint?.id ?? null,
          },
        ])
      }
    }

    // ─── Completed Search tickets ──────────────────────────────────────────────
    const srcCompletedTickets = [
      ['SRC-101', 56, 9.0, 5, 0],
      ['SRC-102', 50, 3.5, 2, 0],
      ['SRC-103', 45, 7.2, 5, 0],
      ['SRC-104', 38, 4.0, 3, 0],
      ['SRC-105', 32, 2.8, 2, 1],
      ['SRC-106', 27, 11.5, 8, 1],
      ['SRC-107', 22, 3.2, 3, 1],
      ['SRC-108', 17, 6.8, 5, 2],
      ['SRC-109', 13, 2.1, 1, 2],
      ['SRC-110', 10, 4.9, 3, 2],
      ['SRC-111', 7, 8.3, 5, 2],
      ['SRC-112', 5, 2.6, 2, 3],
      ['SRC-113', 3, 3.7, 3, 3],
      ['SRC-114', 2, 1.9, 1, 3],
      ['SRC-115', 1, 4.5, 3, 3],
    ] as [string, number, number, number, number][]

    for (const [ticketId, daysAgo, cycleTimeDays, storyPoints, sprintIdx] of srcCompletedTickets) {
      const completedAt = now.minus({ days: daysAgo })
      const startedAt = completedAt.minus({ days: cycleTimeDays })
      const sprint = srcClosedSprints[sprintIdx] ?? srcClosedSprints[srcClosedSprints.length - 1]

      const activeTimeDays = cycleTimeDays * 0.38
      const waitTimeDays = cycleTimeDays * 0.62

      const existingCycle = await WorkItemCycle.findBy('ticket_id', ticketId)
      if (!existingCycle) {
        await WorkItemCycle.create({
          ticketId,
          deliveryStreamId: search.id,
          techStreamIds: null,
          ticketType: storyPoints >= 5 ? 'Story' : 'Task',
          storyPoints,
          createdAtSource: startedAt.minus({ days: 1 }),
          firstInProgress: startedAt,
          completedAt,
          leadTimeDays: cycleTimeDays + 1,
          cycleTimeDays,
          activeTimeDays,
          waitTimeDays,
          flowEfficiencyPct: (activeTimeDays / cycleTimeDays) * 100,
          stageDurations: {
            ba: Math.round(cycleTimeDays * 0.12 * 10) / 10,
            dev: Math.round(cycleTimeDays * 0.45 * 10) / 10,
            code_review: Math.round(cycleTimeDays * 0.28 * 10) / 10,
            qa: Math.round(cycleTimeDays * 0.15 * 10) / 10,
          },
          sprintId: sprint?.id ?? null,
        })
      }

      const existingEvent = await WorkItemEvent.query().where('ticket_id', ticketId).first()
      if (!existingEvent) {
        const rcvd = { receivedAt: startedAt }
        await WorkItemEvent.createMany([
          {
            source: 'jira',
            ticketId,
            eventType: 'created',
            deliveryStreamId: search.id,
            toStage: 'backlog',
            fromStage: null,
            storyPoints,
            ticketType: storyPoints >= 5 ? 'Story' : 'Task',
            eventTimestamp: startedAt.minus({ days: 1 }),
            ...rcvd,
          },
          {
            source: 'jira',
            ticketId,
            eventType: 'transitioned',
            deliveryStreamId: search.id,
            fromStage: 'backlog',
            toStage: 'dev',
            storyPoints,
            eventTimestamp: startedAt,
            ...rcvd,
          },
          {
            source: 'jira',
            ticketId,
            eventType: 'transitioned',
            deliveryStreamId: search.id,
            fromStage: 'dev',
            toStage: 'code_review',
            storyPoints,
            eventTimestamp: startedAt.plus({ days: cycleTimeDays * 0.65 }),
            ...rcvd,
          },
          {
            source: 'jira',
            ticketId,
            eventType: 'completed',
            deliveryStreamId: search.id,
            fromStage: 'code_review',
            toStage: 'done',
            storyPoints,
            eventTimestamp: completedAt,
            ...rcvd,
          },
        ])
      }
    }

    // ─── Active Search WIP items ───────────────────────────────────────────────
    const srcWipTickets: [string, string, number][] = [
      ['SRC-201', 'ba', 2],
      ['SRC-202', 'dev', 4],
      ['SRC-203', 'dev', 1],
      ['SRC-204', 'code_review', 2],
      ['SRC-205', 'qa', 1],
    ]

    for (const [ticketId, stage, daysIn] of srcWipTickets) {
      const existingEvent = await WorkItemEvent.query().where('ticket_id', ticketId).first()
      if (!existingEvent) {
        const startedAt = now.minus({ days: daysIn + 1 })
        await WorkItemEvent.createMany([
          {
            source: 'jira',
            ticketId,
            eventType: 'created',
            deliveryStreamId: search.id,
            toStage: 'backlog',
            fromStage: null,
            storyPoints: 3,
            eventTimestamp: startedAt.minus({ hours: 6 }),
            receivedAt: startedAt.minus({ hours: 6 }),
            sprintId: srcActiveSprint?.id ?? null,
          },
          {
            source: 'jira',
            ticketId,
            eventType: 'transitioned',
            deliveryStreamId: search.id,
            fromStage: 'backlog',
            toStage: stage as any,
            storyPoints: 3,
            eventTimestamp: startedAt,
            receivedAt: startedAt,
            sprintId: srcActiveSprint?.id ?? null,
          },
        ])
      }
    }
  }
}
