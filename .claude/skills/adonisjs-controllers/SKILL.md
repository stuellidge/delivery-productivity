---
name: adonisjs-controllers
description: >
  Build AdonisJS v6 HTTP controllers, define routes, apply middleware, handle errors,
  and implement structured Pino logging. Use when creating controllers, defining API
  routes, adding middleware, handling HTTP errors, or implementing logging in controllers
  and services.
---

# Controllers & Routing (AdonisJS v6)

## Controller Structure

```typescript
import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import Post from '#models/post'

export default class PostsController {
  async index({ request, view }: HttpContext) {
    const posts = await Post.query().orderBy('id', 'desc')
    return view.render('posts/index', { posts })
  }

  async create({ view }: HttpContext) {
    return view.render('posts/create')
  }

  async store({ request, response, session }: HttpContext) {
    const data = await request.validateUsing(createPostValidator)
    const post = await Post.create(data)
    session.flash('success', 'Post created')
    return response.redirect().toRoute('posts.show', { id: post.id })
  }

  async show({ params, view }: HttpContext) {
    const post = await Post.findOrFail(params.id)
    return view.render('posts/show', { post })
  }

  async edit({ params, view }: HttpContext) {
    const post = await Post.findOrFail(params.id)
    return view.render('posts/edit', { post })
  }

  async update({ params, request, response, session }: HttpContext) {
    const post = await Post.findOrFail(params.id)
    const data = await request.validateUsing(updatePostValidator, {
      meta: { resourceId: params.id },
    })
    post.merge(data)
    await post.save()
    session.flash('success', 'Post updated')
    return response.redirect().toRoute('posts.show', { id: post.id })
  }

  async destroy({ params, response, session }: HttpContext) {
    const post = await Post.findOrFail(params.id)
    await post.delete()
    session.flash('success', 'Post deleted')
    return response.redirect().toRoute('posts.index')
  }
}
```

## Route Registration

Routes are defined in `start/routes.ts`:

```typescript
import router from '@adonisjs/core/services/router'

// Lazy-load controllers (recommended)
const PostsController = () => import('#controllers/posts_controller')
const UsersController = () => import('#controllers/users_controller')

// Individual routes
router.get('/posts', [PostsController, 'index'])
router.post('/posts', [PostsController, 'store'])
router.get('/posts/:id', [PostsController, 'show'])
router.put('/posts/:id', [PostsController, 'update'])
router.delete('/posts/:id', [PostsController, 'destroy'])

// Resource routes (generates all 7 RESTful routes)
router.resource('posts', PostsController)

// API resource (excludes create and edit — no form views)
router.resource('posts', PostsController).apiOnly()

// Nested resource routes
router.resource('posts.comments', CommentsController)
  .only(['create', 'store', 'edit', 'update', 'destroy'])

// Route groups
router.group(() => {
  router.resource('posts', PostsController)
  router.resource('users', UsersController)
}).prefix('/api/v1')

// HTTP methods
router.get('path', handler)
router.post('path', handler)
router.put('path', handler)
router.patch('path', handler)
router.delete('path', handler)
router.any('path', handler)         // all standard methods
router.route('/', ['TRACE'], handler) // custom methods
```

## Route Parameters

```typescript
// Required param
router.get('/posts/:id', [PostsController, 'show'])

// Optional param
router.get('/posts/:id?', [PostsController, 'show'])

// Access in controller
async show({ params }: HttpContext) {
  const id = params.id
}
```

## Middleware

### Defining Middleware

Middleware is registered in `start/kernel.ts`:

```typescript
import router from '@adonisjs/core/services/router'

// Named middleware (applied per-route)
router.named({
  auth: () => import('#middleware/auth_middleware'),
  guest: () => import('#middleware/guest_middleware'),
  silentAuth: () => import('#middleware/silent_auth_middleware'),
})
```

### Applying Middleware

```typescript
import { middleware } from '#start/kernel'

// Single route
router.get('/dashboard', [DashboardController, 'index']).use(middleware.auth())

// With parameters
router.get('/payments', [PaymentsController, 'index']).use(
  middleware.auth({ guards: ['web'] })
)

// Route group
router.group(() => {
  router.get('/dashboard', [DashboardController, 'index'])
  router.get('/profile', [ProfileController, 'show'])
}).use(middleware.auth())

// Silent auth for public pages with auth-dependent UI
router.on('/').render('pages/home').use(middleware.silentAuth())
```

### Writing Middleware

```typescript
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

export default class LogRequestMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const start = Date.now()
    await next()
    const duration = Date.now() - start
    ctx.logger.info(
      { method: ctx.request.method(), url: ctx.request.url(), duration },
      'Request completed'
    )
  }
}
```

## Error Handling

### Let AdonisJS Handle Standard Errors

```typescript
// findOrFail → throws E_ROW_NOT_FOUND → AdonisJS returns 404
const post = await Post.findOrFail(params.id)

// Don't wrap in try/catch unless you need custom logging
```

### When You Need Custom Error Handling

```typescript
async store({ request, response }: HttpContext) {
  try {
    const post = await Post.create(request.only(['title', 'body']))
    return response.created(post)
  } catch (error) {
    logger.error(
      { err: error, operation: 'store', controller: 'PostsController' },
      'Failed to create post'
    )
    throw error  // re-throw — let AdonisJS format the response
  }
}
```

### Custom Exception Handler

Global exception handler in `app/exceptions/handler.ts`:

```typescript
import { ExceptionHandler, HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'

export default class HttpExceptionHandler extends ExceptionHandler {
  protected debug = !app.inProduction

  async handle(error: unknown, ctx: HttpContext) {
    return super.handle(error, ctx)
  }

  async report(error: unknown, ctx: HttpContext) {
    // Custom error reporting (e.g. to Sentry)
    return super.report(error, ctx)
  }
}
```

## Structured Logging (Pino)

AdonisJS uses Pino. The `err` key triggers automatic error serialization
(captures type, message, stack).

```typescript
import logger from '@adonisjs/core/services/logger'

// Pino signature: logger.level(mergeObject, message)
// Context object FIRST, string message SECOND

// ✅ Error logging
logger.error(
  { err: error, operation: 'store', controller: 'PostsController', postId: 123 },
  'Failed to create post'
)

// ✅ Info logging
logger.info(
  { operation: 'index', controller: 'PostsController', count: results.length },
  'Listed posts successfully'
)

// ❌ WRONG — string first, object second (Pino ignores the object)
logger.error('Something failed', { operation: 'store' })

// ❌ WRONG — manual extraction (redundant, loses error type)
logger.error({ error: error.message, stack: error.stack }, 'Failed')
```

## Form Method Spoofing

HTML forms only support GET and POST. To use PUT/PATCH/DELETE, enable method spoofing
in `config/app.ts` and pass `_method` as a **query string parameter** (not a hidden field):

```typescript
// config/app.ts
export const http = defineConfig({
  allowMethodSpoofing: true,
})
```

```html
<!-- ✅ Correct — _method in query string -->
<form method="POST" action="/posts/1?_method=PUT">...</form>
<form method="POST" action="/posts/1?_method=DELETE">...</form>

<!-- ❌ Wrong — hidden field is ignored -->
<form method="POST" action="/posts/1">
  <input type="hidden" name="_method" value="PUT">
</form>
```

## VineJS Validation

See the dedicated `vinejs-validation` skill for full schema types, rules, custom
validators, metadata, and error messages. Quick reference for controller usage:

```typescript
import { createPostValidator, updatePostValidator } from '#validators/post'

// In store action — validates and returns typed data; throws 422 on failure
const data = await request.validateUsing(createPostValidator)

// In update action — pass metadata for uniqueness exclusion
const data = await request.validateUsing(updatePostValidator, {
  meta: { resourceId: params.id },
})
```

## Request & Response Helpers

```typescript
async store({ request, response, session }: HttpContext) {
  // Request
  request.input('key')                    // single input (query or body)
  request.input('key', 'default')         // with default
  request.only(['title', 'body'])         // whitelist fields
  request.except(['_csrf'])               // blacklist fields
  request.all()                           // all input data
  request.params()                        // route params
  request.header('Authorization')         // request header
  request.method()                        // HTTP method
  request.url()                           // request URL

  // Response
  response.status(201).json(data)         // explicit status + JSON
  response.created(data)                  // 201
  response.noContent()                    // 204
  response.redirect().toRoute('posts.show', { id: 1 })
  response.redirect().back()
  response.header('X-Custom', 'value')

  // Flash messages (must be set BEFORE redirect)
  session.flash('success', 'Record created')
  session.flash('errors', { login: 'Invalid credentials' })
}
```

## Recommended Pattern: Base Controller for Simple CRUD

For projects with many similar CRUD entities (e.g. name-only entities like Artists,
Genres, Tags), create an abstract base controller to eliminate boilerplate:

```typescript
// app/controllers/base/simple_resource_controller.ts
export default abstract class SimpleResourceController {
  protected abstract model: typeof BaseModel
  protected abstract resourceName: string       // singular, camelCase
  protected abstract routePrefix: string        // URL prefix
  protected abstract createValidator: VineValidator
  protected abstract updateValidator: VineValidator

  async index({ view }: HttpContext) { /* shared index logic */ }
  async create({ view }: HttpContext) { /* shared create form */ }
  async store({ request, response, session }: HttpContext) { /* shared store */ }
  // ... etc
}
```

Concrete controllers then become config-only:
```typescript
export default class CategoriesController extends SimpleResourceController {
  protected model = Category
  protected resourceName = 'category'
  protected routePrefix = 'categories'
  protected createValidator = createCategoryValidator
  protected updateValidator = updateCategoryValidator
}
```

## Generate Controller

```bash
node ace make:controller Posts             # empty controller
node ace make:controller Posts --resource   # with CRUD methods
node ace make:controller Posts --api        # with API CRUD methods (no create/edit)
```

## Further Reference

For authentication guards, rate limiting, or other AdonisJS features not covered
here, use the Context7 MCP server with `context7-compatible-id: adonisjs`.
For validation, see the dedicated `vinejs-validation` skill.
