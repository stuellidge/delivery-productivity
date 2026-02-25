import { test } from '@japa/runner'
import ace from '@adonisjs/core/services/ace'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import DeliveryStream from '#models/delivery_stream'
import ForecastSnapshot from '#models/forecast_snapshot'
import MaterializeForecasts from '#commands/materialize_forecasts'

test.group('Command | scheduler:materialize-forecasts', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('exits 0 and populates forecast_snapshots for today', async ({ assert }) => {
    await DeliveryStream.create({
      name: 'sched-ds1',
      displayName: 'Sched DS1',
      isActive: true,
      teamSize: null,
    })
    const command = await ace.create(MaterializeForecasts, [])
    await command.exec()
    command.assertSucceeded()
    const rows = await ForecastSnapshot.query().where('forecast_date', DateTime.now().toISODate()!)
    assert.isAtLeast(rows.length, 1)
  })

  test('exits 0 and writes nothing when no active delivery streams exist', async ({ assert }) => {
    const command = await ace.create(MaterializeForecasts, [])
    await command.exec()
    command.assertSucceeded()
    const rows = await ForecastSnapshot.query().where('forecast_date', DateTime.now().toISODate()!)
    assert.lengthOf(rows, 0)
  })
})
