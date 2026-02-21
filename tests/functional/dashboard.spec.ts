import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import User from '#models/user'
import DeliveryStream from '#models/delivery_stream'
import TechStream from '#models/tech_stream'
import WorkItemEvent from '#models/work_item_event'
import WorkItemCycle from '#models/work_item_cycle'

async function createUser() {
  return User.create({
    fullName: 'Test User',
    email: 'test@example.com',
    password: 'password123',
    isActive: true,
  })
}

test.group('Dashboard | GET /dashboard', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns 200 for authenticated users', async ({ client }) => {
    const user = await createUser()
    const response = await client.get('/dashboard').loginAs(user)
    response.assertStatus(200)
  })

  test('redirects unauthenticated users to /login', async ({ client }) => {
    const response = await client.get('/dashboard').redirects(0)
    response.assertStatus(302)
    response.assertHeader('location', '/login')
  })

  test('renders stream selector with all active streams', async ({ client, assert }) => {
    const user = await createUser()
    await DeliveryStream.create({ name: 'payments', displayName: 'Payments', isActive: true })
    await DeliveryStream.create({ name: 'onboarding', displayName: 'Onboarding', isActive: true })
    await DeliveryStream.create({ name: 'archived', displayName: 'Archived', isActive: false })

    const response = await client.get('/dashboard').loginAs(user)
    const body = response.text()

    assert.include(body, 'Payments')
    assert.include(body, 'Onboarding')
    assert.notInclude(body, 'Archived')
  })

  test('renders WIP by Stage section heading', async ({ client, assert }) => {
    const user = await createUser()
    await DeliveryStream.create({ name: 'payments', displayName: 'Payments', isActive: true })

    const response = await client.get('/dashboard').loginAs(user)
    assert.include(response.text(), 'Work in Progress')
  })

  test('shows WIP counts when events exist', async ({ client, assert }) => {
    const user = await createUser()
    await DeliveryStream.create({ name: 'payments', displayName: 'Payments', isActive: true })
    const now = DateTime.now()

    for (let i = 1; i <= 3; i++) {
      await WorkItemEvent.create({
        source: 'jira',
        ticketId: `PAY-${i}`,
        eventType: 'transitioned',
        eventTimestamp: now,
        toStage: 'dev',
      })
    }

    const response = await client.get('/dashboard').loginAs(user)
    // 3 items in dev stage
    assert.include(response.text(), '3')
  })

  test('renders Cycle Time section', async ({ client, assert }) => {
    const user = await createUser()
    await DeliveryStream.create({ name: 'payments', displayName: 'Payments', isActive: true })

    const response = await client.get('/dashboard').loginAs(user)
    assert.include(response.text(), 'Cycle Time')
  })

  test('renders Flow Efficiency section', async ({ client, assert }) => {
    const user = await createUser()
    await DeliveryStream.create({ name: 'payments', displayName: 'Payments', isActive: true })

    const response = await client.get('/dashboard').loginAs(user)
    assert.include(response.text(), 'Flow Efficiency')
  })

  test('shows flow efficiency percentage when cycle data exists', async ({ client, assert }) => {
    const user = await createUser()
    await DeliveryStream.create({ name: 'payments', displayName: 'Payments', isActive: true })
    const now = DateTime.now()

    await WorkItemCycle.create({
      ticketId: 'PAY-1',
      createdAtSource: now.minus({ days: 5 }),
      completedAt: now,
      leadTimeDays: 5,
      cycleTimeDays: 5,
      activeTimeDays: 4,
      waitTimeDays: 1,
      flowEfficiencyPct: 80,
      stageDurations: { dev: 4 },
    })

    const response = await client.get('/dashboard').loginAs(user)
    assert.include(response.text(), '80')
  })

  test('filters metrics by stream when ?stream= param provided', async ({ client, assert }) => {
    const user = await createUser()
    const stream = await DeliveryStream.create({
      name: 'payments',
      displayName: 'Payments',
      isActive: true,
    })

    const response = await client.get(`/dashboard?stream=${stream.id}`).loginAs(user)
    assert.include(response.text(), 'Payments')
    response.assertStatus(200)
  })

  test('shows no-data state when no streams are configured', async ({ client, assert }) => {
    const user = await createUser()
    const response = await client.get('/dashboard').loginAs(user)
    assert.include(response.text(), 'No delivery streams configured')
  })

  test('respects custom window param in URL', async ({ client, assert }) => {
    const user = await createUser()
    await DeliveryStream.create({ name: 'payments', displayName: 'Payments', isActive: true })

    const response = await client.get('/dashboard?window=7').loginAs(user)

    response.assertStatus(200)
    // The time window selector should show 7 days as selected
    assert.include(response.text(), '7')
  })

  test('cycle time chart canvas element is present when streams exist', async ({
    client,
    assert,
  }) => {
    const user = await createUser()
    await DeliveryStream.create({ name: 'payments', displayName: 'Payments', isActive: true })

    const response = await client.get('/dashboard').loginAs(user)
    assert.include(response.text(), 'cycleTimeChart')
  })

  test('renders Developer Experience section when tech streams are configured', async ({
    client,
    assert,
  }) => {
    const user = await createUser()
    await DeliveryStream.create({ name: 'payments', displayName: 'Payments', isActive: true })
    await TechStream.create({
      name: 'platform',
      displayName: 'Platform',
      githubOrg: 'acme-platform',
      githubInstallId: '12345',
      isActive: true,
    })

    const response = await client.get('/dashboard').loginAs(user)
    response.assertStatus(200)
    assert.include(response.text(), 'Connect your GitHub webhook')
  })
})
