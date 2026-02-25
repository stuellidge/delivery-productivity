import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { DateTime } from 'luxon'
import Sprint from '#models/sprint'
import DeliveryStream from '#models/delivery_stream'

/**
 * Seeds sprints: 3 closed + 1 active per delivery stream.
 * All sprint dates are relative to the current date so the demo always
 * looks "live" regardless of when it is loaded.
 * Development environment only — will not run in test or production.
 */
export default class SprintsSeeder extends BaseSeeder {
  static environment = ['development']

  async run() {
    const payments = await DeliveryStream.findByOrFail('name', 'payments')
    const search = await DeliveryStream.findByOrFail('name', 'search')

    const now = DateTime.now().startOf('day')

    // Two-week sprints, ending yesterday for the most recently closed
    const sprintDefs = [
      // Payments sprints
      {
        jiraSprintId: 'PAY-S41',
        deliveryStreamId: payments.id,
        name: 'Payments Sprint 41',
        startDate: now.minus({ weeks: 6 }).toISODate()!,
        endDate: now.minus({ weeks: 4, days: 1 }).toISODate()!,
        state: 'closed' as const,
        goal: 'Complete checkout v3 redesign',
      },
      {
        jiraSprintId: 'PAY-S42',
        deliveryStreamId: payments.id,
        name: 'Payments Sprint 42',
        startDate: now.minus({ weeks: 4 }).toISODate()!,
        endDate: now.minus({ weeks: 2, days: 1 }).toISODate()!,
        state: 'closed' as const,
        goal: 'Refund flow reliability improvements',
      },
      {
        jiraSprintId: 'PAY-S43',
        deliveryStreamId: payments.id,
        name: 'Payments Sprint 43',
        startDate: now.minus({ weeks: 2 }).toISODate()!,
        endDate: now.minus({ days: 1 }).toISODate()!,
        state: 'closed' as const,
        goal: 'Payment method expansion — BNPL integration',
      },
      {
        jiraSprintId: 'PAY-S44',
        deliveryStreamId: payments.id,
        name: 'Payments Sprint 44',
        startDate: now.toISODate()!,
        endDate: now.plus({ weeks: 2, days: -1 }).toISODate()!,
        state: 'active' as const,
        goal: 'Fraud detection v2 — rule engine integration',
      },
      // Search sprints
      {
        jiraSprintId: 'SRC-S20',
        deliveryStreamId: search.id,
        name: 'Search Sprint 20',
        startDate: now.minus({ weeks: 6 }).toISODate()!,
        endDate: now.minus({ weeks: 4, days: 1 }).toISODate()!,
        state: 'closed' as const,
        goal: 'Elasticsearch 8 migration',
      },
      {
        jiraSprintId: 'SRC-S21',
        deliveryStreamId: search.id,
        name: 'Search Sprint 21',
        startDate: now.minus({ weeks: 4 }).toISODate()!,
        endDate: now.minus({ weeks: 2, days: 1 }).toISODate()!,
        state: 'closed' as const,
        goal: 'Faceted search filtering',
      },
      {
        jiraSprintId: 'SRC-S22',
        deliveryStreamId: search.id,
        name: 'Search Sprint 22',
        startDate: now.minus({ weeks: 2 }).toISODate()!,
        endDate: now.minus({ days: 1 }).toISODate()!,
        state: 'closed' as const,
        goal: 'Personalisation signals — user history',
      },
      {
        jiraSprintId: 'SRC-S23',
        deliveryStreamId: search.id,
        name: 'Search Sprint 23',
        startDate: now.toISODate()!,
        endDate: now.plus({ weeks: 2, days: -1 }).toISODate()!,
        state: 'active' as const,
        goal: 'A/B test infrastructure for ranking experiments',
      },
    ]

    for (const s of sprintDefs) {
      await Sprint.updateOrCreate({ jiraSprintId: s.jiraSprintId }, s)
    }
  }
}
