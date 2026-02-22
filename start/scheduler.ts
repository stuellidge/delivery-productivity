import scheduler from 'adonisjs-scheduler/services/main'

scheduler.command('scheduler:materialize-cross-stream').hourly().withoutOverlapping()
scheduler.command('scheduler:materialize-forecasts').daily().withoutOverlapping()
