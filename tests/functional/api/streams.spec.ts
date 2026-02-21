import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { createHash } from 'node:crypto'
import ApiKey from '#models/api_key'
import DeliveryStream from '#models/delivery_stream'
import TechStream from '#models/tech_stream'

const RAW_KEY = 'test-api-key-secret'
const KEY_HASH = createHash('sha256').update(RAW_KEY).digest('hex')

async function seedApiKey() {
  return ApiKey.create({
    keyHash: KEY_HASH,
    displayName: 'Test Key',
    permissions: ['metrics:read'],
    isActive: true,
  })
}

test.group('API | GET /api/v1/streams/delivery', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns 401 without API key', async ({ client }) => {
    const response = await client.get('/api/v1/streams/delivery')
    response.assertStatus(401)
  })

  test('returns 401 with an inactive API key', async ({ client }) => {
    await ApiKey.create({
      keyHash: KEY_HASH,
      displayName: 'Disabled Key',
      permissions: ['metrics:read'],
      isActive: false,
    })

    const response = await client
      .get('/api/v1/streams/delivery')
      .header('Authorization', `Bearer ${RAW_KEY}`)

    response.assertStatus(401)
  })

  test('returns 200 with valid key and lists only active streams', async ({ client, assert }) => {
    await seedApiKey()
    await DeliveryStream.create({ name: 'payments', displayName: 'Payments', isActive: true })
    await DeliveryStream.create({ name: 'archived', displayName: 'Archived', isActive: false })

    const response = await client
      .get('/api/v1/streams/delivery')
      .header('Authorization', `Bearer ${RAW_KEY}`)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.status, 'ok')
    assert.lengthOf(body.data, 1)
    assert.equal(body.data[0].name, 'payments')
    assert.exists(body.meta.computed_at)
  })

  test('response data includes id, name, displayName, description', async ({ client, assert }) => {
    await seedApiKey()
    await DeliveryStream.create({
      name: 'payments',
      displayName: 'Payments',
      description: 'Payment systems',
      isActive: true,
    })

    const response = await client
      .get('/api/v1/streams/delivery')
      .header('Authorization', `Bearer ${RAW_KEY}`)

    const stream = response.body().data[0]
    assert.exists(stream.id)
    assert.equal(stream.name, 'payments')
    assert.equal(stream.displayName, 'Payments')
    assert.equal(stream.description, 'Payment systems')
  })
})

test.group('API | GET /api/v1/streams/tech', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns 401 without API key', async ({ client }) => {
    const response = await client.get('/api/v1/streams/tech')
    response.assertStatus(401)
  })

  test('returns 200 with valid key and lists only active tech streams', async ({
    client,
    assert,
  }) => {
    await seedApiKey()
    await TechStream.create({
      name: 'core-api',
      displayName: 'Core API',
      githubOrg: 'acme-core-api',
      githubInstallId: 'install-1',
      isActive: true,
    })
    await TechStream.create({
      name: 'inactive',
      displayName: 'Inactive',
      githubOrg: 'acme-inactive',
      githubInstallId: 'install-2',
      isActive: false,
    })

    const response = await client
      .get('/api/v1/streams/tech')
      .header('Authorization', `Bearer ${RAW_KEY}`)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.status, 'ok')
    assert.lengthOf(body.data, 1)
    assert.equal(body.data[0].name, 'core-api')
    assert.exists(body.meta.computed_at)
  })

  test('response data includes id, name, displayName, githubOrg', async ({ client, assert }) => {
    await seedApiKey()
    await TechStream.create({
      name: 'core-api',
      displayName: 'Core API',
      githubOrg: 'acme-core-api',
      githubInstallId: 'install-1',
      isActive: true,
    })

    const response = await client
      .get('/api/v1/streams/tech')
      .header('Authorization', `Bearer ${RAW_KEY}`)

    const stream = response.body().data[0]
    assert.exists(stream.id)
    assert.equal(stream.name, 'core-api')
    assert.equal(stream.displayName, 'Core API')
    assert.equal(stream.githubOrg, 'acme-core-api')
  })
})
