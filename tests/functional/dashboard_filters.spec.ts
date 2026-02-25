import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import User from '#models/user'
import TechStream from '#models/tech_stream'
import DeliveryStream from '#models/delivery_stream'
import Sprint from '#models/sprint'
import { DateTime } from 'luxon'

async function createUser() {
  return User.create({
    fullName: 'Test User',
    email: 'test@example.com',
    password: 'password123',
    isActive: true,
  })
}

test.group('Dashboard | Tech Stream Filter', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('renders tech stream dropdown with all active tech streams', async ({ client }) => {
    const user = await createUser()
    await TechStream.create({
      name: 'core-api',
      displayName: 'Core API',
      githubOrg: 'acme-core-api',
      githubInstallId: 'inst-1',
      isActive: true,
    })
    await TechStream.create({
      name: 'auth',
      displayName: 'Auth Service',
      githubOrg: 'acme-auth',
      githubInstallId: 'inst-2',
      isActive: true,
    })

    const response = await client.get('/dashboard').loginAs(user)
    response.assertStatus(200)
    response.assertTextIncludes('Core API')
    response.assertTextIncludes('Auth Service')
    response.assertTextIncludes('name="techStream"')
  })

  test('accepts techStream query param without error', async ({ client }) => {
    const user = await createUser()
    const ts = await TechStream.create({
      name: 'core-api',
      displayName: 'Core API',
      githubOrg: 'acme-core-api',
      githubInstallId: 'inst-1',
      isActive: true,
    })

    const response = await client.get(`/dashboard?techStream=${ts.id}`).loginAs(user)
    response.assertStatus(200)
  })

  test('inactive tech streams are not shown in the dropdown', async ({ client }) => {
    const user = await createUser()
    await TechStream.create({
      name: 'retired',
      displayName: 'Retired Service',
      githubOrg: 'acme-retired',
      githubInstallId: 'inst-3',
      isActive: false,
    })

    const response = await client.get('/dashboard').loginAs(user)
    response.assertStatus(200)
    const text = response.text()
    if (text.includes('Retired Service')) {
      throw new Error('Inactive tech stream should not appear in dropdown')
    }
  })
})

test.group('Dashboard | Sprint Time Range', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('shows "Current Sprint" option when active sprint exists for selected delivery stream', async ({
    client,
  }) => {
    const user = await createUser()
    const stream = await DeliveryStream.create({
      name: 'payments',
      displayName: 'Payments',
      isActive: true,
    })
    await Sprint.create({
      jiraSprintId: 'SPRINT-1',
      deliveryStreamId: stream.id,
      name: 'Sprint 1',
      startDate: DateTime.now().minus({ days: 5 }).toISODate()!,
      endDate: DateTime.now().plus({ days: 9 }).toISODate()!,
      state: 'active',
    })

    const response = await client.get(`/dashboard?stream=${stream.id}`).loginAs(user)
    response.assertStatus(200)
    response.assertTextIncludes('Current Sprint')
  })

  test('accepts window=sprint query param', async ({ client }) => {
    const user = await createUser()
    const stream = await DeliveryStream.create({
      name: 'payments',
      displayName: 'Payments',
      isActive: true,
    })
    await Sprint.create({
      jiraSprintId: 'SPRINT-1',
      deliveryStreamId: stream.id,
      name: 'Sprint 1',
      startDate: DateTime.now().minus({ days: 5 }).toISODate()!,
      endDate: DateTime.now().plus({ days: 9 }).toISODate()!,
      state: 'active',
    })

    const response = await client.get(`/dashboard?stream=${stream.id}&window=sprint`).loginAs(user)
    response.assertStatus(200)
  })
})

test.group('Dashboard | Zone Toggles', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('renders zone toggle controls', async ({ client }) => {
    const user = await createUser()
    const response = await client.get('/dashboard').loginAs(user)
    response.assertStatus(200)
    response.assertTextIncludes('data-zone-toggle')
  })

  test('accepts zones query param to show only selected zones', async ({ client }) => {
    const user = await createUser()
    const response = await client.get('/dashboard?zones=realtime,trend').loginAs(user)
    response.assertStatus(200)
  })
})
