import { DateTime } from 'luxon'
import WorkItemEvent from '#models/work_item_event'
import WorkItemCycle from '#models/work_item_cycle'
import StatusMapping from '#models/status_mapping'
import type { PipelineStage } from '#models/status_mapping'

export default class WorkItemCycleComputationService {
  constructor(private readonly ticketId: string) {}

  async compute(): Promise<WorkItemCycle | null> {
    const events = await WorkItemEvent.query()
      .where('ticket_id', this.ticketId)
      .orderBy('event_timestamp', 'asc')

    const completedEvent = events.find((e) => e.eventType === 'completed')
    if (!completedEvent) return null

    const createdEvent = events.find((e) => e.eventType === 'created')
    const completedAt = completedEvent.eventTimestamp

    const transitions = events.filter(
      (e) => e.eventType === 'transitioned' && e.toStage !== null
    )

    const projectKey = this.ticketId.split('-')[0]
    const activeStages = await this.loadActiveStages(projectKey, transitions)

    // first_in_progress = first transition to an active-work stage
    const firstActiveTransition = transitions.find((t) => activeStages.has(t.toStage!))
    const firstInProgress = firstActiveTransition?.eventTimestamp ?? null

    // Build stage_durations from first_in_progress onwards
    const stageDurations: Record<string, number> = {}
    let activeTimeDays = 0
    let waitTimeDays = 0

    // Find the index of the first active transition
    const firstActiveIdx = transitions.findIndex((t) => activeStages.has(t.toStage!))

    if (firstActiveIdx >= 0) {
      const relevantTransitions = transitions.slice(firstActiveIdx)

      for (let i = 0; i < relevantTransitions.length; i++) {
        const current = relevantTransitions[i]
        const nextTimestamp =
          i + 1 < relevantTransitions.length
            ? relevantTransitions[i + 1].eventTimestamp
            : completedAt

        const durationMs =
          nextTimestamp.toMillis() - current.eventTimestamp.toMillis()
        const durationDays = durationMs / (1000 * 60 * 60 * 24)
        const stage = current.toStage!

        stageDurations[stage] = (stageDurations[stage] ?? 0) + durationDays

        if (activeStages.has(stage)) {
          activeTimeDays += durationDays
        } else {
          waitTimeDays += durationDays
        }
      }
    }

    // Compute time metrics
    const createdAtSource = createdEvent?.eventTimestamp ?? transitions[0]?.eventTimestamp ?? completedAt
    const leadTimeDays = this.daysBetween(createdAtSource, completedAt)
    const cycleTimeDays = firstInProgress ? this.daysBetween(firstInProgress, completedAt) : 0
    const flowEfficiencyPct = cycleTimeDays > 0 ? (activeTimeDays / cycleTimeDays) * 100 : 0

    // Gather ticket metadata from latest available event
    const latestEvent = events[events.length - 1]
    const deliveryStreamId = latestEvent?.deliveryStreamId ?? null
    const ticketType = latestEvent?.ticketType ?? null
    const storyPoints = latestEvent?.storyPoints ?? null

    // Upsert work_item_cycle
    const existing = await WorkItemCycle.findBy('ticket_id', this.ticketId)

    const data = {
      ticketId: this.ticketId,
      deliveryStreamId,
      ticketType,
      storyPoints,
      createdAtSource,
      firstInProgress,
      completedAt,
      leadTimeDays,
      cycleTimeDays,
      activeTimeDays,
      waitTimeDays,
      flowEfficiencyPct,
      stageDurations,
    }

    if (existing) {
      existing.merge(data)
      await existing.save()
      return existing
    }

    return WorkItemCycle.create(data)
  }

  private async loadActiveStages(
    projectKey: string,
    transitions: WorkItemEvent[]
  ): Promise<Set<PipelineStage>> {
    const stages = [...new Set(transitions.map((t) => t.toStage).filter(Boolean))] as PipelineStage[]

    if (stages.length === 0) return new Set()

    const mappings = await StatusMapping.query()
      .where('jira_project_key', projectKey)
      .whereIn('pipeline_stage', stages)

    const activeSet = new Set<PipelineStage>()
    for (const mapping of mappings) {
      if (mapping.isActiveWork) {
        activeSet.add(mapping.pipelineStage)
      }
    }
    return activeSet
  }

  private daysBetween(from: DateTime, to: DateTime): number {
    return (to.toMillis() - from.toMillis()) / (1000 * 60 * 60 * 24)
  }
}
