import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import User from '#models/user'
import { throttleState } from '#middleware/login_throttle_middleware'

test.group('Auth | login', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('renders the login page', async ({ client }) => {
    const response = await client.get('/login')
    response.assertStatus(200)
    response.assertTextIncludes('Sign in')
  })

  test('redirects to dashboard on successful login', async ({ client }) => {
    const user = await User.create({
      fullName: 'Test User',
      email: 'test@example.com',
      password: 'password123',
      isActive: true,
    })

    const response = await client
      .post('/login')
      .withCsrfToken()
      .fields({ email: user.email, password: 'password123' })
      .redirects(0)

    response.assertStatus(302)
    response.assertHeader('location', '/dashboard')
  })

  test('flashes error on invalid credentials', async ({ client }) => {
    await User.create({
      fullName: 'Test User',
      email: 'test@example.com',
      password: 'password123',
      isActive: true,
    })

    const response = await client
      .post('/login')
      .withCsrfToken()
      .fields({ email: 'test@example.com', password: 'wrong' })
      .redirects(0)

    response.assertStatus(302)
    response.assertHeader('location', '/login')
    response.assertFlashMessage('errors.login', 'Invalid email or password')
  })

  test('rejects inactive users', async ({ client }) => {
    await User.create({
      fullName: 'Inactive User',
      email: 'inactive@example.com',
      password: 'password123',
      isActive: false,
    })

    const response = await client
      .post('/login')
      .withCsrfToken()
      .fields({ email: 'inactive@example.com', password: 'password123' })
      .redirects(0)

    response.assertStatus(302)
    response.assertHeader('location', '/login')
  })

  test('redirects authenticated users away from login page', async ({ client }) => {
    const user = await User.create({
      fullName: 'Test User',
      email: 'test@example.com',
      password: 'password123',
      isActive: true,
    })

    const response = await client.get('/login').loginAs(user).redirects(0)
    response.assertStatus(302)
    response.assertHeader('location', '/dashboard')
  })
})

test.group('Auth | logout', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('logs out authenticated user and redirects to login', async ({ client }) => {
    const user = await User.create({
      fullName: 'Test User',
      email: 'test@example.com',
      password: 'password123',
      isActive: true,
    })

    const response = await client.post('/logout').loginAs(user).withCsrfToken()
    response.assertRedirectsTo('/login')
  })

  test('redirects unauthenticated users to login when accessing logout', async ({ client }) => {
    const response = await client.post('/logout').withCsrfToken().redirects(0)
    response.assertStatus(302)
    response.assertHeader('location', '/login')
  })
})

test.group('Auth | login rate limiting', (group) => {
  group.each.setup(() => {
    throttleState.clear()
    return testUtils.db().withGlobalTransaction()
  })

  test('returns 429 after 10 login attempts within window', async ({ client }) => {
    for (let i = 0; i < 10; i++) {
      await client
        .post('/login')
        .withCsrfToken()
        .fields({ email: `user${i}@example.com`, password: 'wrong' })
        .redirects(0)
    }

    const response = await client
      .post('/login')
      .withCsrfToken()
      .fields({ email: 'attacker@example.com', password: 'wrong' })
      .redirects(0)

    response.assertStatus(429)
  })
})

test.group('Auth | protected routes', (group) => {
  group.each.setup(() => testUtils.db().withGlobalTransaction())

  test('redirects unauthenticated users to login from dashboard', async ({ client }) => {
    const response = await client.get('/dashboard').redirects(0)
    response.assertStatus(302)
    response.assertHeader('location', '/login')
  })

  test('allows authenticated users to access dashboard', async ({ client }) => {
    const user = await User.create({
      fullName: 'Test User',
      email: 'test@example.com',
      password: 'password123',
      isActive: true,
    })

    const response = await client.get('/dashboard').loginAs(user)
    response.assertStatus(200)
  })
})
