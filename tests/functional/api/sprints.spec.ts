import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { createHash } from 'node:crypto'
import ApiKey from '#models/api_key'
import DeliveryStream from '#models/delivery_stream'
import Sprint from '#models/sprint'

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

async function seedStream(name: string) {
  return DeliveryStream.create({ name, displayName: name, isActive: true })
}

async function seedSprint(
  deliveryStreamId: number | null,
  name: string,
  state: 'active' | 'closed' | 'future'
) {
  return Sprint.create({
    jiraSprintId: `JIRA-${name}`,
    deliveryStreamId,
    name,
    startDate: '2026-01-01',
    endDate: '2026-01-14',
    state,
  })
}

test.group('API | GET /api/v1/sprints', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns 401 when no API key provided', async ({ client }) => {
    const response = await client.get('/api/v1/sprints')
    response.assertStatus(401)
  })

  test('returns all sprints when no filters applied', async ({ client, assert }) => {
    await seedApiKey()
    const ds = await seedStream('payments')
    await seedSprint(ds.id, 'Sprint 1', 'active')
    await seedSprint(ds.id, 'Sprint 2', 'closed')

    const response = await client
      .get('/api/v1/sprints')
      .header('Authorization', `Bearer ${RAW_KEY}`)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.status, 'ok')
    assert.isArray(body.data)
    assert.isAtLeast(body.data.length, 2)
    assert.exists(body.meta.computed_at)
  })

  test('filters by delivery stream when stream param provided', async ({ client, assert }) => {
    await seedApiKey()
    const ds1 = await seedStream('stream-a')
    const ds2 = await seedStream('stream-b')
    await seedSprint(ds1.id, 'Sprint A1', 'active')
    await seedSprint(ds2.id, 'Sprint B1', 'closed')

    const response = await client
      .get(`/api/v1/sprints?stream=${ds1.id}`)
      .header('Authorization', `Bearer ${RAW_KEY}`)

    response.assertStatus(200)
    const body = response.body()
    assert.isArray(body.data)
    assert.isTrue(body.data.every((s: any) => s.deliveryStreamId === ds1.id))
    assert.isFalse(body.data.some((s: any) => s.deliveryStreamId === ds2.id))
  })

  test('filters by state when state param provided', async ({ client, assert }) => {
    await seedApiKey()
    const ds = await seedStream('stream-c')
    await seedSprint(ds.id, 'Active Sprint', 'active')
    await seedSprint(ds.id, 'Closed Sprint', 'closed')

    const response = await client
      .get('/api/v1/sprints?state=active')
      .header('Authorization', `Bearer ${RAW_KEY}`)

    response.assertStatus(200)
    const body = response.body()
    assert.isArray(body.data)
    assert.isTrue(body.data.every((s: any) => s.state === 'active'))
    assert.isFalse(body.data.some((s: any) => s.state === 'closed'))
  })

  test('response includes expected sprint fields', async ({ client, assert }) => {
    await seedApiKey()
    const ds = await seedStream('stream-d')
    await seedSprint(ds.id, 'Full Sprint', 'active')

    const response = await client
      .get('/api/v1/sprints')
      .header('Authorization', `Bearer ${RAW_KEY}`)

    const sprint = response.body().data[0]
    assert.exists(sprint.id)
    assert.exists(sprint.jiraSprintId)
    assert.exists(sprint.name)
    assert.exists(sprint.state)
    assert.exists(sprint.startDate)
    assert.exists(sprint.endDate)
  })
})
