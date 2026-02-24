import scheduler from 'adonisjs-scheduler/services/main'

// Cross-stream, forecast, and daily metrics materialisation
scheduler.command('scheduler:materialize-cross-stream').hourly().withoutOverlapping()
scheduler.command('scheduler:materialize-forecasts').daily().withoutOverlapping()
scheduler.command('scheduler:materialize-daily-metrics').daily().withoutOverlapping()

// Jira scheduled polling (§5.2.6)
scheduler.command('scheduler:poll-sprint-snapshots').everyTwoHours().withoutOverlapping()
scheduler.command('scheduler:poll-backlog').daily().withoutOverlapping()

// GitHub repository sync (§5.3.7)
scheduler.command('scheduler:sync-repositories').daily().withoutOverlapping()

// GitHub gap detection (§5.3.7)
scheduler.command('scheduler:detect-github-gaps').daily().withoutOverlapping()

// PR delivery stream enrichment (§5.3.6) — 5-minute targeted retry
scheduler.command('scheduler:enrich-pr-delivery-streams').everyFiveMinutes().withoutOverlapping()

// Data retention enforcement (§8.3)
scheduler.command('scheduler:enforce-data-retention').daily().withoutOverlapping()

// Async event queue processor (§5 Phase 18)
scheduler.command('scheduler:process-event-queue').everyMinute().withoutOverlapping()

// Alert notifications (§5 Phase 18) — every 15 minutes
scheduler.command('scheduler:send-alert-notifications').everyFifteenMinutes().withoutOverlapping()
