---
name: japa-testing
description: >
  Write tests for AdonisJS v6 applications using the Japa test framework including
  test setup, plugins, HTTP testing, authentication, CSRF tokens, redirect handling,
  lifecycle hooks, datasets, grouping, and coverage. Use when writing tests, setting
  up test infrastructure, debugging test failures, or working with test assertions.
---

# Japa Testing (AdonisJS v6)

## Critical Rules

1. **NO NESTED GROUPS**: `test.group()` inside another `test.group()` is not supported.
   Use flat groups with descriptive names.
2. **NEVER use `--grep`**: It does not work in Japa. Use `--groups` and `--tests`.
3. **No semicolons** in test files (project convention).

## Bootstrap Setup (tests/bootstrap.ts)

```typescript
import { assert } from '@japa/assert'
import { apiClient } from '@japa/api-client'
import { pluginAdonisJS } from '@japa/plugin-adonisjs'
import app from '@adonisjs/core/services/app'
import testUtils from '@adonisjs/core/services/test_utils'
import { Config } from '@adonisjs/core/types'

// Start HTTP server for functional test suites
export const configureSuite: Config['configureSuite'] = (suite) => {
  if (['functional', 'e2e'].includes(suite.name)) {
    return suite.setup(() => testUtils.httpServer().start())
  }
}

// Core plugins (always needed)
export const plugins: Config['plugins'] = [assert(), apiClient(), pluginAdonisJS(app)]

// For web apps with session auth, also add:
// import { sessionApiClient } from '@adonisjs/session/plugins/api_client'
// import { shieldApiClient } from '@adonisjs/shield/plugins/api_client'
// import { authApiClient } from '@adonisjs/auth/plugins/api_client'
// Then add to plugins array:
//   sessionApiClient(app),
//   shieldApiClient(),
//   authApiClient(app),
```

## Basic Test Structure

```typescript
import { test } from '@japa/runner'

test.group('Posts | create', (group) => {
  // Runs before each test in this group
  group.each.setup(async () => {
    // setup logic
    return async () => {
      // cleanup (returned function runs after test)
    }
  })

  test('creates a post with valid data', async ({ assert, client }) => {
    const response = await client.post('/api/posts').json({
      title: 'Hello',
      body: 'World',
    })
    response.assertStatus(201)
    assert.equal(response.body().title, 'Hello')
  })

  test('rejects post without title', async ({ client }) => {
    const response = await client.post('/api/posts').json({ body: 'World' })
    response.assertStatus(422)
  })
})
```

## Running Tests

```bash
# All tests
npm test

# Single file
node ace test --files=path/to/testfile.spec.ts

# By group name
node ace test --groups="Posts | create"

# Single test within a group
node ace test --groups="Posts | create" --tests="creates a post with valid data"

# By suite
node ace test unit
node ace test functional

# Coverage
npx c8 --include="path/to/file.ts" node ace test --files=path/to/testfile.spec.ts

# Debug logging
LOG_LEVEL=info node ace test --files=path/to/testfile.spec.ts

# Node.js flags (before the command)
node ace --no-warnings --trace-exit test
```

## HTTP Testing (API Client)

```typescript
test('list users', async ({ client }) => {
  const response = await client.get('/api/users')

  response.assertStatus(200)
  response.assertBodyContains({ data: [] })
})

test('create user', async ({ client }) => {
  const response = await client
    .post('/api/users')
    .json({ email: 'test@example.com', password: 'secret' })
    .header('X-Custom', 'value')

  response.assertStatus(201)
})

// Available HTTP methods
client.get('/path')
client.post('/path')
client.put('/path')
client.patch('/path')
client.delete('/path')
client.head('/path')
client.options('/path')
```

### Response Assertions

```typescript
response.assertStatus(200)
response.assertBody({ key: 'value' }) // exact match
response.assertBodyContains({ key: 'value' }) // partial match
response.assertHeader('content-type', 'application/json')
response.assertRedirectsTo('/login') // after auto-follow

// Access response data
response.body()
response.status()
response.headers()
response.text()
response.cookie('session')
```

## Web App Testing (Session Auth)

### Authentication

```typescript
// loginAs() requires authApiClient plugin
const user = await User.create({ email: 'a@b.com', password: 'secret' })
const response = await client.get('/dashboard').loginAs(user)
response.assertStatus(200)

// Session auth middleware returns 302 redirect to /login (NOT 401)
const response = await client.get('/dashboard').redirects(0)
response.assertStatus(302)
response.assertHeader('location', '/login')
```

### CSRF Protection

```typescript
// withCsrfToken() requires shieldApiClient plugin
// ALL state-changing requests need it
await client.post('/posts').withCsrfToken().fields({ title: 'Hello' })
await client.put('/posts/1').withCsrfToken().fields({ title: 'Updated' })
await client.delete('/posts/1').withCsrfToken()

// CSRF middleware returns 302 redirect back for web requests (NOT 403)
// To verify CSRF rejection, check the action wasn't performed
```

### Form Submissions

```typescript
// Use .fields() for form data (NOT .form() or .json())
await client.post('/login').withCsrfToken().fields({
  email: 'test@example.com',
  password: 'secret',
})
```

### Redirect Testing

```typescript
// Pattern 1: Test redirect details (disable auto-follow)
const response = await client
  .post('/login')
  .withCsrfToken()
  .redirects(0)
  .fields({ email: 'wrong@b.com', password: 'bad' })
response.assertStatus(302)
response.assertHeader('location', '/login')

// Pattern 2: Test final destination (allow auto-follow — default)
const response = await client.post('/logout').loginAs(user).withCsrfToken()
response.assertRedirectsTo('/login')
```

### Testing Flash Messages

```typescript
const response = await client
  .post('/login')
  .withCsrfToken()
  .redirects(0)
  .fields({ email: 'wrong@b.com', password: 'bad' })
response.assertFlashMessage('errors.login', 'Invalid email or password')
```

## Lifecycle Hooks

### Group-level (run once for the group)

```typescript
test.group('Users', (group) => {
  group.setup(async () => {
    // before all tests in group
    return async () => {
      // after all tests in group (cleanup)
    }
  })

  group.teardown(async () => {
    // after all tests — alternative to cleanup function
  })
})
```

### Per-test (run for each test in group)

```typescript
test.group('Users', (group) => {
  group.each.setup(async () => {
    await createTables()
    return async () => await dropTables() // cleanup after each
  })

  group.each.teardown(async () => {
    // runs after each test
  })
})
```

### Test-level

```typescript
test('slow operation', async ({ assert }) => {
  // test code
})
  .setup(async () => {
    // before this specific test
    return () => {
      // cleanup after this specific test
    }
  })
  .timeout(30_000)
```

## Datasets

Run the same test with multiple inputs:

```typescript
test('validates email format')
  .with(['user@example.com', 'user+tag@example.com', 'user@123.123.123.123'])
  .run(({ assert }, email) => {
    assert.isTrue(validateEmail(email))
  })

// With objects
test('validates form data')
  .with([
    { email: 'valid@test.com', result: true },
    { email: '@invalid.com', result: false },
    { email: 'no-domain', result: false },
  ])
  .run(({ assert }, row) => {
    assert.equal(validateEmail(row.email), row.result)
  })
```

## Assertions (Chai.js API)

```typescript
test('example', ({ assert }) => {
  assert.equal(actual, expected)
  assert.notEqual(actual, expected)
  assert.deepEqual(actual, expected)
  assert.isTrue(value)
  assert.isFalse(value)
  assert.isNull(value)
  assert.isNotNull(value)
  assert.exists(value) // not null or undefined
  assert.lengthOf(array, 3)
  assert.include(string, 'sub')
  assert.include(array, item)
  assert.throws(() => fn())
  assert.rejects(async () => await fn())
  assert.instanceOf(obj, ClassName)
  assert.property(obj, 'key')
  assert.containsSubset(obj, { key: 'val' })
})
```

## Environment Setup

`.env.test` must include `SESSION_DRIVER=memory` for `loginAs()` and `withCsrfToken()`
to work. Without it, session-based test helpers will silently fail.

## Common Patterns

### Database Reset per Test

```typescript
import testUtils from '@adonisjs/core/services/test_utils'

test.group('Users', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())
})
```

### Test Database Isolation

Always use scoped queries in tests to avoid matching pre-existing dev data:

```typescript
// ❌ WRONG — may match records from dev seeder
const record = await MyModel.findBy('position', 1)

// ✅ CORRECT — scope to test-created records
const record = await MyModel.query()
  .where('parent_id', parent.id)
  .where('position', 1)
  .firstOrFail()
```

### Request-Level Setup

```typescript
test('list posts', async ({ client }) => {
  const response = await client.get('/posts').setup(async () => {
    await PostFactory.createMany(20)
    return () => clearDatabase()
  })
  response.assertStatus(200)
})
```

### Testing Authenticated Routes

```typescript
import User from '#models/user'

test.group('Posts | create', (group) => {
  let user: User

  group.each.setup(async () => {
    user = await User.create({
      email: 'test@example.com',
      password: 'password123',
    })
    return async () => {
      await user.delete()
    }
  })

  test('requires authentication', async ({ client }) => {
    const response = await client.get('/posts/create').redirects(0)
    response.assertStatus(302)
    response.assertHeader('location', '/login')
  })

  test('renders create form', async ({ client }) => {
    const response = await client.get('/posts/create').loginAs(user)
    response.assertStatus(200)
    response.assertTextIncludes('Create Post')
  })

  test('stores a new post', async ({ client, assert }) => {
    const response = await client
      .post('/posts')
      .loginAs(user)
      .withCsrfToken()
      .fields({ title: 'My Post', body: 'Content here' })
      .redirects(0)
    response.assertStatus(302)

    const post = await Post.findByOrFail('title', 'My Post')
    assert.equal(post.body, 'Content here')
  })

  test('rejects without CSRF token', async ({ client, assert }) => {
    await client.post('/posts').loginAs(user).fields({ title: 'Hack Attempt' })
    // Verify the post wasn't created
    const post = await Post.findBy('title', 'Hack Attempt')
    assert.isNull(post)
  })
})
```

## Recommended Pattern: Shared CRUD Test Suite

For projects with many similar CRUD entities, create a shared test helper that
generates the full CRUD test suite from configuration:

```typescript
// tests/functional/helpers/simple_resource.ts
export function testSimpleResource(config: {
  model: typeof BaseModel
  resourceName: string
  routePrefix: string
  sampleData: Record<string, any>
  updateData: Record<string, any>
}) {
  // Generates test groups for: index, create, store, show, edit, update, destroy
  // Each group tests: auth, validation, CSRF, success case, 404 handling
}
```

This eliminates test boilerplate for simple entities while keeping tests explicit
and readable.

## Further Reference

For browser testing, snapshot assertions, file system plugin, or reporter configuration
not covered here, use the Context7 MCP server with `context7-compatible-id: japa_dev`.
For AdonisJS-specific test utilities, use `context7-compatible-id: adonisjs`.
