import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { DateTime } from 'luxon'
import User from '#models/user'
import TechStream from '#models/tech_stream'
import DeliveryStream from '#models/delivery_stream'
import CrossStreamCorrelation from '#models/cross_stream_correlation'

async function createUser() {
  return User.create({
    fullName: 'Test User',
    email: 'test@example.com',
    password: 'password123',
    isActive: true,
  })
}

async function seedTechStream(name: string) {
  return TechStream.create({
    name,
    displayName: name,
    githubOrg: `org-${name}`,
    githubInstallId: '12345',
    isActive: true,
  })
}

async function seedDeliveryStream(name: string) {
  return DeliveryStream.create({ name, displayName: name, isActive: true })
}

test.group('Cross-Stream | GET /cross-stream', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('redirects unauthenticated to login', async ({ client }) => {
    const response = await client.get('/cross-stream').redirects(0)
    response.assertStatus(302)
    response.assertHeader('location', '/login')
  })

  test('renders cross-stream page for authenticated user', async ({ client, assert }) => {
    const user = await createUser()
    await seedTechStream('platform-cs')
    await seedDeliveryStream('payments-cs')

    const response = await client.get('/cross-stream').loginAs(user)
    response.assertStatus(200)
    assert.include(response.text(), 'Cross-Stream')
  })

  test('shows "no blockages" message when no correlations exist', async ({ client, assert }) => {
    const user = await createUser()

    const response = await client.get('/cross-stream').loginAs(user)
    response.assertStatus(200)
    assert.include(response.text(), 'No cross-stream blockages')
  })

  test('renders heatmap table when correlations exist in DB', async ({ client, assert }) => {
    const user = await createUser()
    const ts = await seedTechStream('platform-hm')
    await seedDeliveryStream('payments-hm')

    // Seed a materialised correlation row for today
    await CrossStreamCorrelation.create({
      analysisDate: DateTime.now().toISODate()!,
      techStreamId: ts.id,
      impactedDeliveryStreams: [],
      blockedDeliveryStreams: [],
      blockCount14d: 5,
      avgConfidencePct: 65,
      avgCycleTimeP85: null,
      severity: 'high',
      computedAt: DateTime.now(),
    })

    const response = await client.get('/cross-stream').loginAs(user)
    response.assertStatus(200)
    assert.include(response.text(), 'high')
    assert.include(response.text(), '5')
  })
})
