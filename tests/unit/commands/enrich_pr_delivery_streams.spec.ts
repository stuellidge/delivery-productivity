import { test } from '@japa/runner'
import ace from '@adonisjs/core/services/ace'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import TechStream from '#models/tech_stream'
import Repository from '#models/repository'
import DeliveryStream from '#models/delivery_stream'
import WorkItemEvent from '#models/work_item_event'
import PrEvent from '#models/pr_event'
import EnrichPrDeliveryStreams from '#commands/enrich_pr_delivery_streams'

test.group('Command | scheduler:enrich-pr-delivery-streams', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('exits successfully when there are no pending PrEvents', async () => {
    const command = await ace.create(EnrichPrDeliveryStreams, [])
    await command.exec()
    command.assertSucceeded()
  })

  test('exits successfully and enriches pending PrEvents', async () => {
    const ts = await TechStream.create({
      name: 'enrich-cmd-ts',
      displayName: 'Enrich CMD TS',
      githubOrg: 'acme-enrich-cmd',
      githubInstallId: '66601',
      isActive: true,
    })
    const repo = await Repository.create({
      techStreamId: ts.id,
      githubOrg: 'acme-enrich-cmd',
      githubRepoName: 'api',
      fullName: 'acme-enrich-cmd/api',
      defaultBranch: 'main',
      isDeployable: true,
      isActive: true,
    })
    const ds = await DeliveryStream.create({
      name: 'enrich-cmd-ds',
      displayName: 'Enrich CMD DS',
      isActive: true,
    })

    await WorkItemEvent.create({
      source: 'jira',
      ticketId: 'PAY-999',
      eventType: 'created',
      deliveryStreamId: ds.id,
      eventTimestamp: DateTime.utc(),
    })

    await PrEvent.create({
      source: 'github',
      eventType: 'opened',
      prNumber: 999,
      repoId: repo.id,
      githubOrg: repo.githubOrg,
      githubRepo: 'api',
      techStreamId: ts.id,
      linkedTicketId: 'PAY-999',
      deliveryStreamId: null,
      eventTimestamp: DateTime.utc(),
    })

    const command = await ace.create(EnrichPrDeliveryStreams, [])
    await command.exec()
    command.assertSucceeded()
  })
})
