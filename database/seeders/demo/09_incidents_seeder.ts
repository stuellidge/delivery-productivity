import { BaseSeeder } from '@adonisjs/lucid/seeders'
import { DateTime } from 'luxon'
import IncidentEvent from '#models/incident_event'
import TechStream from '#models/tech_stream'

/**
 * Seeds incident events (alarm_triggered + alarm_resolved pairs).
 * Produces realistic TTR data for the DORA MTTR metric.
 *
 * Target: TTR median ~40 min, mean ~55 min (High–Elite performer band).
 * Development environment only — will not run in test or production.
 */
export default class IncidentsSeeder extends BaseSeeder {
  static environment = ['development']

  async run() {
    const backend = await TechStream.findByOrFail('github_org', 'acme-demo')

    const now = DateTime.now()

    // [incidentId, daysAgo, ttrMinutes, severity, serviceName, description]
    const incidents: [string, number, number, string, string, string][] = [
      [
        'INC-2024-001',
        82,
        28,
        'high',
        'payments-api',
        'Elevated 5xx error rate on /checkout endpoint',
      ],
      [
        'INC-2024-002',
        75,
        65,
        'critical',
        'payments-api',
        'Payment gateway timeout — downstream PSP unreachable',
      ],
      [
        'INC-2024-003',
        68,
        42,
        'medium',
        'payments-worker',
        'Refund processing queue backup — consumer lag spike',
      ],
      [
        'INC-2024-004',
        55,
        18,
        'low',
        'search-api',
        'Elevated p99 latency on /search after index rebuild',
      ],
      [
        'INC-2024-005',
        48,
        95,
        'high',
        'payments-api',
        'Cascade failure from database connection pool exhaustion',
      ],
      [
        'INC-2024-006',
        35,
        32,
        'medium',
        'search-api',
        'Personalisation service returning stale recommendations',
      ],
      [
        'INC-2024-007',
        20,
        55,
        'high',
        'payments-worker',
        'Idempotency key collision causing duplicate charges',
      ],
      [
        'INC-2024-008',
        8,
        22,
        'medium',
        'payments-api',
        'Auth token validation errors after certificate rotation',
      ],
    ]

    for (const [incidentId, daysAgo, ttrMinutes, severity, serviceName, description] of incidents) {
      const triggeredAt = now.minus({ days: daysAgo, hours: 2 })
      const resolvedAt = triggeredAt.plus({ minutes: ttrMinutes })

      const existingTrigger = await IncidentEvent.query()
        .where('incident_id', incidentId)
        .where('event_type', 'alarm_triggered')
        .first()

      if (!existingTrigger) {
        await IncidentEvent.createMany([
          {
            eventType: 'alarm_triggered',
            incidentId,
            serviceName,
            severity: severity as any,
            description,
            techStreamId: backend.id,
            occurredAt: triggeredAt,
            resolvedAt: null,
            timeToRestoreMin: null,
          },
          {
            eventType: 'alarm_resolved',
            incidentId,
            serviceName,
            severity: severity as any,
            description: `${description} — resolved`,
            techStreamId: backend.id,
            occurredAt: resolvedAt,
            resolvedAt,
            timeToRestoreMin: ttrMinutes,
          },
        ])
      }
    }
  }
}
