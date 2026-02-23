import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { createHash } from 'node:crypto'
import ApiKey from '#models/api_key'
import DeliveryStream from '#models/delivery_stream'
import TechStream from '#models/tech_stream'

const RAW_KEY = 'test-scoped-key-secret'
const KEY_HASH = createHash('sha256').update(RAW_KEY).digest('hex')

async function seedDeliveryStream(name: string) {
  return DeliveryStream.create({ name, displayName: name, isActive: true })
}

async function seedTechStream(name: string) {
  return TechStream.create({
    name,
    displayName: name,
    githubOrg: `org-${name}`,
    githubInstallId: `${Math.floor(Math.random() * 100000)}`,
    isActive: true,
  })
}

test.group('API | Stream scope enforcement', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('unscoped key (null streamScope) can access any delivery stream', async ({
    client,
    assert,
  }) => {
    const ds = await seedDeliveryStream('payments')
    await ApiKey.create({
      keyHash: KEY_HASH,
      displayName: 'Unscoped Key',
      permissions: ['metrics:read'],
      streamScope: null,
      isActive: true,
    })

    const response = await client
      .get(`/api/v1/metrics/realtime?stream=${ds.id}`)
      .header('Authorization', `Bearer ${RAW_KEY}`)

    // Middleware passes; controller may return 200 with empty data
    assert.notEqual(response.status(), 403)
  })

  test('delivery-scoped key blocked when requesting out-of-scope delivery stream', async ({
    client,
  }) => {
    const ds1 = await seedDeliveryStream('payments')
    const ds2 = await seedDeliveryStream('logistics')
    await ApiKey.create({
      keyHash: KEY_HASH,
      displayName: 'Scoped Key',
      permissions: ['metrics:read'],
      streamScope: { deliveryStreamIds: [ds1.id] },
      isActive: true,
    })

    // Request with ds2 which is out of scope
    const response = await client
      .get(`/api/v1/metrics/realtime?stream=${ds2.id}`)
      .header('Authorization', `Bearer ${RAW_KEY}`)

    response.assertStatus(403)
    const body = response.body()
    response.assertBodyContains({ status: 'error' })
    body
  })

  test('delivery-scoped key allowed when requesting in-scope delivery stream', async ({
    client,
  }) => {
    const ds = await seedDeliveryStream('payments')
    await ApiKey.create({
      keyHash: KEY_HASH,
      displayName: 'Scoped Key',
      permissions: ['metrics:read'],
      streamScope: { deliveryStreamIds: [ds.id] },
      isActive: true,
    })

    const response = await client
      .get(`/api/v1/metrics/realtime?stream=${ds.id}`)
      .header('Authorization', `Bearer ${RAW_KEY}`)

    // Middleware passes — controller handles the rest
    response.assertStatus(200)
  })

  test('delivery-scoped key allowed when no stream param provided', async ({ client }) => {
    const ds = await seedDeliveryStream('payments')
    await ApiKey.create({
      keyHash: KEY_HASH,
      displayName: 'Scoped Key',
      permissions: ['metrics:read'],
      streamScope: { deliveryStreamIds: [ds.id] },
      isActive: true,
    })

    const response = await client
      .get('/api/v1/metrics/realtime')
      .header('Authorization', `Bearer ${RAW_KEY}`)

    // No stream param — middleware does not restrict
    response.assertStatus(200)
  })

  test('tech-stream-scoped key blocked when requesting out-of-scope tech stream', async ({
    client,
  }) => {
    const ts1 = await seedTechStream('backend')
    const ts2 = await seedTechStream('mobile')
    await ApiKey.create({
      keyHash: KEY_HASH,
      displayName: 'Tech Scoped Key',
      permissions: ['metrics:read'],
      streamScope: { techStreamIds: [ts1.id] },
      isActive: true,
    })

    const response = await client
      .get(`/api/v1/metrics/realtime?techStream=${ts2.id}`)
      .header('Authorization', `Bearer ${RAW_KEY}`)

    response.assertStatus(403)
  })

  test('tech-stream-scoped key allowed when requesting in-scope tech stream', async ({
    client,
  }) => {
    const ts = await seedTechStream('backend')
    await ApiKey.create({
      keyHash: KEY_HASH,
      displayName: 'Tech Scoped Key',
      permissions: ['metrics:read'],
      streamScope: { techStreamIds: [ts.id] },
      isActive: true,
    })

    const response = await client
      .get(`/api/v1/metrics/realtime?techStream=${ts.id}`)
      .header('Authorization', `Bearer ${RAW_KEY}`)

    response.assertStatus(200)
  })
})
