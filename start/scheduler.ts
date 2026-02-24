import scheduler from 'adonisjs-scheduler/services/main'

// Cross-stream and forecast materialisation
scheduler.command('scheduler:materialize-cross-stream').hourly().withoutOverlapping()
scheduler.command('scheduler:materialize-forecasts').daily().withoutOverlapping()

// Jira scheduled polling (§5.2.6)
scheduler.command('scheduler:poll-sprint-snapshots').everyTwoHours().withoutOverlapping()
scheduler.command('scheduler:poll-backlog').daily().withoutOverlapping()

// GitHub repository sync (§5.3.7)
scheduler.command('scheduler:sync-repositories').daily().withoutOverlapping()
