import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { createHash } from 'node:crypto'
import ApiKey from '#models/api_key'

const RAW_KEY = 'test-backfill-api-key'
const KEY_HASH = createHash('sha256').update(RAW_KEY).digest('hex')

async function seedApiKey() {
  return ApiKey.create({
    keyHash: KEY_HASH,
    displayName: 'Backfill Key',
    permissions: ['admin:write'],
    isActive: true,
  })
}

test.group('API | POST /api/v1/admin/backfill/:source/:org', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('returns 401 without API key', async ({ client }) => {
    const response = await client.post('/api/v1/admin/backfill/jira/MY-PROJECT')
    response.assertStatus(401)
  })

  test('returns 202 immediately for valid jira source', async ({ client, assert }) => {
    await seedApiKey()

    const response = await client
      .post('/api/v1/admin/backfill/jira/MY-PROJECT')
      .header('Authorization', `Bearer ${RAW_KEY}`)

    response.assertStatus(202)
    const body = response.body()
    assert.equal(body.status, 'ok')
    assert.include(body.data.message, 'jira')
    assert.include(body.data.message, 'MY-PROJECT')
  })

  test('returns 202 immediately for valid github source', async ({ client, assert }) => {
    await seedApiKey()

    const response = await client
      .post('/api/v1/admin/backfill/github/my-org')
      .header('Authorization', `Bearer ${RAW_KEY}`)

    response.assertStatus(202)
    const body = response.body()
    assert.equal(body.status, 'ok')
    assert.include(body.data.message, 'github')
  })

  test('returns 422 for invalid source', async ({ client }) => {
    await seedApiKey()

    const response = await client
      .post('/api/v1/admin/backfill/unknown/my-org')
      .header('Authorization', `Bearer ${RAW_KEY}`)

    response.assertStatus(422)
  })
})
