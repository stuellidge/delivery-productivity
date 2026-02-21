import { test } from '@japa/runner'
import CacheService from '#services/cache_service'

test.group('CacheService | remember', (group) => {
  let cache: CacheService

  group.each.setup(() => {
    cache = new CacheService()
  })

  test('calls factory fn on cache miss and returns value', async ({ assert }) => {
    let calls = 0
    const result = await cache.remember('key1', 60, async () => {
      calls++
      return 'hello'
    })
    assert.equal(result, 'hello')
    assert.equal(calls, 1)
  })

  test('returns cached value within TTL without calling factory again', async ({ assert }) => {
    let calls = 0
    await cache.remember('key2', 60, async () => {
      calls++
      return 'cached'
    })
    const result = await cache.remember('key2', 60, async () => {
      calls++
      return 'new-value'
    })
    assert.equal(result, 'cached')
    assert.equal(calls, 1)
  })

  test('calls factory fn again after TTL expiry', async ({ assert }) => {
    let calls = 0
    // TTL of 0.001 seconds — expires immediately
    await cache.remember('key3', 0.001, async () => {
      calls++
      return 'first'
    })
    // Wait 10ms for TTL to expire
    await new Promise((resolve) => setTimeout(resolve, 10))
    const result = await cache.remember('key3', 60, async () => {
      calls++
      return 'second'
    })
    assert.equal(result, 'second')
    assert.equal(calls, 2)
  })
})

test.group('CacheService | invalidate', (group) => {
  let cache: CacheService

  group.each.setup(() => {
    cache = new CacheService()
  })

  test('invalidate() removes a specific key so next call hits factory', async ({ assert }) => {
    let calls = 0
    await cache.remember('key4', 60, async () => {
      calls++
      return 'value'
    })
    cache.invalidate('key4')
    await cache.remember('key4', 60, async () => {
      calls++
      return 'refreshed'
    })
    assert.equal(calls, 2)
  })

  test('invalidateByPrefix() removes all matching keys', async ({ assert }) => {
    let calls = 0
    await cache.remember('metrics:realtime:1', 60, async () => {
      calls++
      return 'a'
    })
    await cache.remember('metrics:realtime:2', 60, async () => {
      calls++
      return 'b'
    })
    await cache.remember('metrics:diagnostic:1', 60, async () => {
      calls++
      return 'c'
    })
    cache.invalidateByPrefix('metrics:realtime:')
    await cache.remember('metrics:realtime:1', 60, async () => {
      calls++
      return 'a2'
    })
    await cache.remember('metrics:realtime:2', 60, async () => {
      calls++
      return 'b2'
    })
    await cache.remember('metrics:diagnostic:1', 60, async () => {
      calls++
      return 'c2'
    })
    // 3 initial fills + 2 realtime refills (diagnostic stayed cached)
    assert.equal(calls, 5)
  })
})
