# AdonisJS v6 — Common AI Pitfalls

This document captures mistakes that AI assistants (including Claude) frequently make when generating AdonisJS code. These are drawn from real-world experience building production applications. **Read this before writing any AdonisJS code.**

---

## 1. AdonisJS v5 vs v6 Syntax (THE #1 TRAP)

AI models are heavily trained on v5 examples. v6 has breaking changes everywhere.

### Model Properties

```typescript
// ❌ v5 (WRONG)
public id: number
public name: string

// ✅ v6 (CORRECT)
declare id: number
declare name: string
```

### Import Paths

```typescript
// ❌ v5 IoC container imports (WRONG)
import { schema } from '@ioc:Adonis/Lucid/Orm'
import { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'
import Database from '@ioc:Adonis/Lucid/Database'

// ✅ v6 package imports (CORRECT)
import { BaseModel, column } from '@adonisjs/lucid/orm'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
```

### Validation

```typescript
// ❌ v5 schema-based validation (WRONG)
import { schema, rules } from '@ioc:Adonis/Core/Validator'
const postSchema = schema.create({
  title: schema.string({}, [rules.maxLength(255)]),
})

// ✅ v6 VineJS validation (CORRECT)
import vine from '@vinejs/vine'
const createPostValidator = vine.compile(
  vine.object({
    title: vine.string().trim().maxLength(255),
  })
)
```

### Edge.js Templates

```edge
{{-- ❌ v5 syntax (WRONG) --}}
@layout('layouts/app')
  @section('content')
    @set('title', 'Hello')
      {{ e(userInput) }}
  {{ safe(trustedHtml) }}
  {{ stringify(obj) }}
    @endsection
    
    {{-- ✅ v6 syntax (CORRECT) --}}
    @component('layouts/app', { title: 'Hello' })
      @slot('main')
        @let(myVar = 'Hello')
        {{ html.escape(userInput) }}
    {{{ html.safe(trustedHtml) }}}
    {{ js.stringify(obj) }}
      @end
    @end
```

### Method Spoofing

```html
<!-- ❌ WRONG — hidden field is silently ignored in v6 -->
<form method="POST" action="/posts/1">
  <input type="hidden" name="_method" value="PUT" />
</form>

<!-- ✅ CORRECT — _method must be in the query string -->
<form method="POST" action="/posts/1?_method=PUT"></form>

<!-- ✅ Using Edge route helper -->
<form method="POST" action="{{ route('posts.update', { id: post.id }) }}?_method=PUT">
  {{ csrfField() }}
</form>
```

---

## 2. Edge.js Template Traps

### `$loop.last` Does Not Exist

```edge
{{-- ❌ WRONG — $loop.last is not available in @each --}}
@each(item in items)
  {{ item.name }}{{ $loop.last ? '' : ', ' }}
@end

{{-- ✅ CORRECT — use index comparison --}}
@each((item, index) in items)
  {{ item.name }}{{ index < items.length - 1 ? ', ' : '' }}
@end
```

### Arrow Functions Don't Work in Expressions

```edge
{{-- ❌ WRONG — arrow functions fail silently --}}
{{ items.filter(i => i.active).length }}
{{ items.map(i => i.name).join(', ') }}
{{-- ✅ CORRECT — use @each/@if, or compute in controller --}}
```

### Variable Scoping in Slots

Variables defined with `@let` inside a component slot are not accessible inside `@each` loops within that slot. Pre-compute data in the controller instead:

```typescript
// Controller — compute here
const selectedTagIds = post.tags.map((t) => t.id)
return view.render('posts/edit', { post, tags, selectedTagIds })
```

```edge
{{-- Template — use controller-provided variable --}}
@each(tag in tags)
  <option value="{{ tag.id }}" {{ selectedTagIds.includes(tag.id) ? 'selected' : '' }}>
    {{ tag.name }}
  </option>
@end
```

---

## 3. Lucid ORM Traps

### DateTime Columns

```typescript
// ❌ WRONG — passing a string to a DateTime column
await Post.create({ publishedAt: DateTime.now().toISODate()! })
await Post.create({ publishedAt: '2024-01-15' })

// ✅ CORRECT — pass a Luxon DateTime object
await Post.create({ publishedAt: DateTime.now() })
await Post.create({ publishedAt: DateTime.fromISO('2024-01-15') })
```

### Raw Queries Use Column Names, Not Property Names

Lucid auto-maps camelCase properties to snake_case columns — but only in model queries, not raw queries.

```typescript
// ❌ WRONG — camelCase in raw query
await db.from('users').where('createdAt', '>', someDate)
await db.from('users').where('firstName', 'Alice')

// ✅ CORRECT — snake_case column names in raw queries
await db.from('users').where('created_at', '>', someDate)
await db.from('users').where('first_name', 'Alice')

// ✅ Model queries can use camelCase (auto-mapped)
await User.query().where('createdAt', '>', someDate)
```

### Many-to-Many: attach vs sync

```typescript
// CREATE — use attach() to add relationships
await post.related('tags').attach([1, 2, 3])

// UPDATE — use sync() to replace ALL relationships
// sync() removes old ones and adds new ones atomically
await post.related('tags').sync([2, 3, 4])

// ❌ WRONG on update — attach() only adds, doesn't remove old ones
await post.related('tags').attach([2, 3, 4])
```

### N+1 Query Prevention

```typescript
// ❌ WRONG — triggers N+1 queries
const posts = await Post.all()
for (const post of posts) {
  console.log(post.author.name) // Each access triggers a query
}

// ✅ CORRECT — eager load relationships
const posts = await Post.query().preload('author').preload('tags')
```

### Update Validators Need Meta for Uniqueness

When validating uniqueness on update, you must exclude the current record:

```typescript
// ✅ CORRECT — exclude current record from uniqueness check
export const updateArtistValidator = vine.withMetaData<{ resourceId: number }>().compile(
  vine.object({
    name: vine
      .string()
      .trim()
      .minLength(1)
      .unique(async (db, value, field) => {
        const row = await db
          .from('artists')
          .where('name', value)
          .whereNot('id', field.meta.resourceId)
          .first()
        return !row
      }),
  })
)

// In controller:
const data = await request.validateUsing(updateArtistValidator, {
  meta: { resourceId: params.id },
})
```

---

## 4. Pino Logging Traps

```typescript
import logger from '@adonisjs/core/services/logger'

// ❌ WRONG — string first, object second (Pino ignores the object)
logger.error('Something failed', { operation: 'store' })

// ✅ CORRECT — merge object FIRST, message string SECOND
logger.error(
  { err: error, operation: 'store', controller: 'PostsController' },
  'Failed to create post'
)

// ❌ WRONG — manually extracting error properties
logger.error({ error: error.message, stack: error.stack }, 'Failed')

// ✅ CORRECT — use the `err` key for automatic Pino error serialization
logger.error({ err: error }, 'Failed')
```

---

## 5. Japa Testing Traps

### No Nested Groups

```typescript
// ❌ WRONG — nested groups are silently ignored
test.group('Users', () => {
  test.group('Create', () => {  // THIS DOESN'T WORK
    test('creates user', async () => { ... })
  })
})

// ✅ CORRECT — flat groups with descriptive names
test.group('Users | create', () => {
  test('creates user', async () => { ... })
})

test.group('Users | update', () => {
  test('updates user', async () => { ... })
})
```

### `--grep` Does Not Work

```bash
# ❌ WRONG — --grep is not a Japa option
node ace test --grep="creates user"

# ✅ CORRECT — use --groups and --tests
node ace test --groups="Users | create"
node ace test --groups="Users | create" --tests="creates user"
```

### Form Data Method

```typescript
// ❌ WRONG — .form() and .json() don't work for HTML form submissions
await client.post('/login').form({ email: 'a@b.com' })
await client.post('/login').json({ email: 'a@b.com' })

// ✅ CORRECT — use .fields() for form-encoded data
await client.post('/login').withCsrfToken().fields({ email: 'a@b.com' })
```

### Session Auth Returns 302, Not 401

```typescript
// ❌ WRONG — expecting 401 for unauthenticated web requests
response.assertStatus(401)

// ✅ CORRECT — session auth middleware redirects to /login
const response = await client.get('/dashboard').redirects(0)
response.assertStatus(302)
response.assertHeader('location', '/login')
```

### CSRF Rejection Returns 302 (Redirect Back), Not 403

```typescript
// ❌ WRONG
response.assertStatus(403)

// ✅ CORRECT — CSRF failure redirects back
// Verify by checking the action wasn't performed
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

### `.env.test` Requirements

`SESSION_DRIVER=memory` **must** be set in `.env.test` for `loginAs()` and `withCsrfToken()` to work. Without it, session-based test helpers silently fail.

---

## 6. CSS Framework Traps (Pico CSS)

### Pico v1 vs v2 Dropdown Pattern

```html
<!-- ❌ v1 pattern (WRONG for Pico v2) -->
<details role="list" dir="rtl">
  <summary aria-haspopup="listbox" role="link">Menu</summary>
  <ul role="listbox">
    <li><a href="#">Item</a></li>
  </ul>
</details>

<!-- ✅ v2 pattern (CORRECT) -->
<details class="dropdown">
  <summary>Menu</summary>
  <ul dir="rtl">
    <li><a href="#">Item</a></li>
  </ul>
</details>
```

### Pico Buttons Are Block-Level by Default

`[role="button"]` and `<button>` elements are `display: block; width: 100%` in Pico. For inline buttons, you need custom CSS:

```css
.form-actions {
  display: flex;
  gap: var(--pico-spacing);
}

.form-actions [role='button'],
.form-actions button {
  width: auto;
  margin-bottom: 0;
}
```

### CDN vs Vite

Always install Pico via npm and import through your bundler, not via CDN:

```css
/* resources/css/app.css */
@import '@picocss/pico';
```

```bash
npm install @picocss/pico
```

---

## 7. General AdonisJS Traps

### Scaffolding in Non-Empty Directories

`npm init adonisjs@latest` fails in non-empty directories. Scaffold in a temp directory and copy files:

```bash
cd /tmp && npm init adonisjs@latest my-app
# Then copy into your project directory
```

### `findOrFail` Is Your Friend

Don't write manual 404 handling:

```typescript
// ❌ WRONG — unnecessary manual checking
const post = await Post.find(params.id)
if (!post) {
  return response.notFound('Post not found')
}

// ✅ CORRECT — AdonisJS handles the 404 automatically
const post = await Post.findOrFail(params.id)
```

### Controller Lazy Loading

Always lazy-load controllers in routes for faster startup:

```typescript
// ❌ WRONG — eager import
import PostsController from '#controllers/posts_controller'
router.resource('posts', PostsController)

// ✅ CORRECT — lazy import (function returning dynamic import)
const PostsController = () => import('#controllers/posts_controller')
router.resource('posts', PostsController)
```

### Flash Messages on Redirect

Flash messages must be set before redirect, and they only persist for one request:

```typescript
// ✅ CORRECT
session.flash('success', 'Record created')
return response.redirect().toRoute('posts.show', { id: post.id })
```

### Silent Auth for Public Pages

Pages that show different content based on login state (e.g. homepage nav) need `silentAuth` middleware — not `auth` (which blocks) or nothing (which leaves `auth.isAuthenticated` undefined):

```typescript
router.on('/').render('pages/home').use(middleware.silentAuth())
```
