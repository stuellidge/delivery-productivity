import { test } from '@japa/runner'
import ace from '@adonisjs/core/services/ace'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import TechStream from '#models/tech_stream'
import CrossStreamCorrelation from '#models/cross_stream_correlation'
import MaterializeCrossStream from '#commands/materialize_cross_stream'

test.group('Command | scheduler:materialize-cross-stream', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('exits 0 and populates cross_stream_correlations for today', async ({ assert }) => {
    await TechStream.create({
      name: 'sched-ts1',
      displayName: 'Sched TS1',
      githubOrg: 'acme-sched',
      githubInstallId: '77777',
      isActive: true,
    })
    const command = await ace.create(MaterializeCrossStream, [])
    await command.exec()
    command.assertSucceeded()
    const rows = await CrossStreamCorrelation.query().where(
      'analysis_date',
      DateTime.now().toISODate()!
    )
    assert.isAtLeast(rows.length, 1)
  })

  test('exits 0 and writes nothing when no active tech streams exist', async ({ assert }) => {
    const command = await ace.create(MaterializeCrossStream, [])
    await command.exec()
    command.assertSucceeded()
    const rows = await CrossStreamCorrelation.query().where(
      'analysis_date',
      DateTime.now().toISODate()!
    )
    assert.lengthOf(rows, 0)
  })
})
