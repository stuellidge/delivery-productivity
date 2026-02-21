---
name: vinejs-validation
description: >
  Validate request data in AdonisJS v6 using VineJS including schema types, string/number/date
  rules, enums, arrays, objects, optional/nullable modifiers, custom rules, unique database
  checks, metadata, error messages, and controller integration. Use when creating validators,
  adding validation rules, handling form input, or working with request.validateUsing.
---

# VineJS Validation (AdonisJS v6)

## Critical: v6 Uses VineJS, Not Schema-Based Validation

```typescript
// ❌ v5 (WRONG) — schema-based validation was removed in v6
import { schema, rules } from '@ioc:Adonis/Core/Validator'
const postSchema = schema.create({
  title: schema.string({}, [rules.maxLength(255)]),
})

// ✅ v6 (CORRECT) — VineJS
import vine from '@vinejs/vine'
const createPostValidator = vine.compile(
  vine.object({
    title: vine.string().trim().maxLength(255),
  })
)
```

## Compiling Validators

AdonisJS convention: use `vine.compile()` to pre-compile validators for reuse.

```typescript
import vine from '@vinejs/vine'

// Standard validator
export const createPostValidator = vine.compile(
  vine.object({
    title: vine.string().trim().minLength(1).maxLength(255),
    body: vine.string().trim().optional(),
  })
)

// Validator with metadata (for update uniqueness checks)
export const updatePostValidator = vine
  .withMetaData<{ resourceId: number }>()
  .compile(
    vine.object({
      title: vine.string().trim().minLength(1).maxLength(255),
      body: vine.string().trim().optional(),
    })
  )
```

## Using Validators in Controllers

```typescript
import type { HttpContext } from '@adonisjs/core/http'
import { createPostValidator, updatePostValidator } from '#validators/post'

export default class PostsController {
  async store({ request, response, session }: HttpContext) {
    // Validates and returns typed data; throws 422 on failure
    const data = await request.validateUsing(createPostValidator)
    const post = await Post.create(data)
    session.flash('success', 'Post created')
    return response.redirect().toRoute('posts.show', { id: post.id })
  }

  async update({ params, request, response, session }: HttpContext) {
    // Pass metadata for uniqueness exclusion
    const data = await request.validateUsing(updatePostValidator, {
      meta: { resourceId: params.id },
    })
    const post = await Post.findOrFail(params.id)
    post.merge(data)
    await post.save()
    session.flash('success', 'Post updated')
    return response.redirect().toRoute('posts.show', { id: post.id })
  }
}
```

Validation errors automatically redirect back with flash messages. Access them
in Edge.js templates via `flashMessages.get('errors.fieldName')`.

## Schema Types

### String — `vine.string()`

```typescript
vine.string()                           // required string
vine.string().trim()                    // trim whitespace (always use this)
vine.string().minLength(1)              // minimum length
vine.string().maxLength(255)            // maximum length
vine.string().fixedLength(10)           // exact length
vine.string().email()                   // email validation
vine.string().url()                     // URL validation
vine.string().uuid()                    // UUID validation
vine.string().regex(/^\d{3}-\d{4}$/)   // custom regex
vine.string().alpha()                   // letters only
vine.string().alphaNumeric()            // letters and numbers only
vine.string().confirmed()              // requires matching _confirmation field
vine.string().toLowerCase()             // transform to lowercase
vine.string().toUpperCase()             // transform to uppercase
vine.string().escape()                  // HTML-escape the value
vine.string().ipAddress()               // IP address (v4 or v6)
vine.string().creditCard()              // credit card number
vine.string().mobile({ locale: ['en-GB'] })  // phone number
vine.string().postalCode({ countryCode: ['GB'] })

// Chaining multiple rules
vine.string().trim().minLength(1).maxLength(255).toLowerCase()
```

### Number — `vine.number()`

```typescript
vine.number()                           // required number (coerces strings)
vine.number({ strict: true })           // no string-to-number coercion
vine.number().min(0)                    // minimum value
vine.number().max(100)                  // maximum value
vine.number().range([1, 10])            // value between 1 and 10
vine.number().positive()                // must be > 0
vine.number().negative()                // must be < 0
vine.number().nonNegative()             // must be >= 0
vine.number().decimal([2, 4])           // 2–4 decimal places
vine.number().withoutDecimals()         // integer only
vine.number().in([10, 20, 30])          // allowed values
```

### Boolean — `vine.boolean()`

```typescript
vine.boolean()                          // accepts true/false, 1/0, 'true'/'false'
vine.boolean({ strict: true })          // only true/false
vine.boolean().accepted()               // must be truthy (for checkboxes/ToS)
```

### Date — `vine.date()`

```typescript
vine.date()                             // any parseable date
vine.date({ formats: ['YYYY-MM-DD'] })  // specific format(s)
vine.date().before('today')             // must be in the past
vine.date().after('today')              // must be in the future
vine.date().beforeOrEqual('2025-12-31')
vine.date().afterOrEqual('2020-01-01')
vine.date().afterField('startDate')     // compare to another field
vine.date().weekday()                   // must be a weekday
vine.date().weekend()                   // must be a weekend
```

### Enum — `vine.enum()`

```typescript
// Array of allowed values
vine.enum(['draft', 'published', 'archived'])

// With TypeScript const assertion for type safety
vine.enum(['draft', 'published', 'archived'] as const)

// TypeScript enum
enum Status { Draft = 'draft', Published = 'published' }
vine.enum(Status)

// Dynamic values from metadata
vine.enum((field) => field.meta.allowedStatuses)
```

### Array — `vine.array()`

```typescript
// Array of numbers (e.g. multi-select IDs)
vine.array(vine.number())

// Array of strings
vine.array(vine.string().trim())

// Array of objects
vine.array(
  vine.object({
    email: vine.string().email(),
    role: vine.enum(['admin', 'user']),
  })
)

// Modifiers
vine.array(vine.number()).minLength(1)     // at least one item
vine.array(vine.number()).maxLength(10)    // at most 10 items
vine.array(vine.number()).fixedLength(3)   // exactly 3 items
vine.array(vine.number()).notEmpty()       // alias for minLength(1)
vine.array(vine.number()).distinct()       // unique values only
vine.array(vine.number()).compact()        // remove null/undefined/empty strings

// Distinct by field (for arrays of objects)
vine.array(
  vine.object({ email: vine.string() })
).distinct('email')
```

### Object — `vine.object()`

```typescript
vine.object({
  name: vine.string(),
  email: vine.string().email(),
})

// Allow extra properties (not stripped)
vine.object({ name: vine.string() }).allowUnknownProperties()

// Convert snake_case keys to camelCase
vine.object({ first_name: vine.string() }).toCamelCase()
```

### Union / Discriminated Union — `vine.group()` and `vine.unionOfTypes()`

```typescript
// Discriminated union — merge conditional fields into an object
const paymentMethod = vine.group([
  vine.group.if((data) => data.type === 'stripe', {
    type: vine.literal('stripe'),
    account_id: vine.string(),
  }),
  vine.group.if((data) => data.type === 'paypal', {
    type: vine.literal('paypal'),
    email: vine.string().email(),
  }),
])

// Merge the group into a parent object
const schema = vine
  .object({ type: vine.enum(['stripe', 'paypal']) })
  .merge(paymentMethod)

// Union of simple types (for a single field)
vine.unionOfTypes([vine.string(), vine.boolean()])
```

## Modifiers: optional vs nullable

```typescript
// Required (default) — value must be present and non-null
vine.string()

// Optional — field can be missing/undefined, but if present must be valid
vine.string().optional()
// Type: string | undefined

// Nullable — field must be present but can be null
vine.string().nullable()
// Type: string | null

// Both — field can be missing, or present as null, or present as string
vine.string().optional().nullable()
// Type: string | null | undefined
```

## Database Uniqueness Checks

VineJS provides `.unique()` for async database validation:

```typescript
// CREATE — check name is unique in the table
export const createArtistValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1).unique(async (db, value) => {
      const row = await db.from('artists').where('name', value).first()
      return !row  // return true if unique
    }),
  })
)

// UPDATE — exclude current record from uniqueness check
export const updateArtistValidator = vine
  .withMetaData<{ resourceId: number }>()
  .compile(
    vine.object({
      name: vine.string().trim().minLength(1).unique(async (db, value, field) => {
        const row = await db
          .from('artists')
          .where('name', value)
          .whereNot('id', field.meta.resourceId)
          .first()
        return !row
      }),
    })
  )
```

**Important:** The `.unique()` callback receives the Lucid `db` query builder.
Use **snake_case column names** in these queries (not camelCase model properties).

## Password Confirmation

```typescript
vine.object({
  password: vine.string().minLength(8).maxLength(32).confirmed(),
  // Expects a matching field named `password_confirmation` in the input
})
```

The `confirmed()` rule automatically looks for `<fieldName>_confirmation`.

## Custom Rules

```typescript
import vine from '@vinejs/vine'

// Synchronous rule
const isSlug = vine.createRule((value, options, field) => {
  if (typeof value !== 'string' || !/^[a-z0-9-]+$/.test(value)) {
    field.report('The {{ field }} must be a valid slug', 'isSlug', field)
  }
})

// Async rule (e.g. database lookup)
const isActiveUser = vine.createRule(
  async (value, options, field) => {
    const user = await User.find(value)
    if (!user || !user.isActive) {
      field.report('The {{ field }} must reference an active user', 'isActiveUser', field)
    }
  },
  { isAsync: true }
)

// Rule with typed options
const divisibleBy = vine.createRule<{ divisor: number }>((value, options, field) => {
  if (typeof value === 'number' && value % options.divisor !== 0) {
    field.report(
      `The {{ field }} must be divisible by ${options.divisor}`,
      'divisibleBy',
      field
    )
  }
})

// Usage — chain with .use()
vine.string().use(isSlug())
vine.number().use(divisibleBy({ divisor: 5 }))
vine.number().use(isActiveUser())
```

## Custom Error Messages

```typescript
import vine, { SimpleMessagesProvider } from '@vinejs/vine'

// Set globally (e.g. in start/validator.ts)
vine.messagesProvider = new SimpleMessagesProvider(
  {
    // Generic rule messages
    'required': 'The {{ field }} field is required',
    'string': 'The {{ field }} field must be a string',
    'email': 'Please provide a valid email address',
    'minLength': 'The {{ field }} field must be at least {{ min }} characters',
    'maxLength': 'The {{ field }} field must not exceed {{ max }} characters',
    'enum': 'The selected {{ field }} is invalid',
    'number': 'The {{ field }} field must be a number',

    // Field-specific messages (field.rule format)
    'username.required': 'Please choose a username',
    'email.email': 'The email format is invalid',
    'password.minLength': 'Password must be at least {{ min }} characters',
    'password.confirmed': 'Passwords do not match',

    // Array element messages
    'contacts.*.email.email': 'Each contact must have a valid email',
  },
  // Optional: human-readable field names
  {
    first_name: 'first name',
    last_name: 'last name',
  }
)
```

You can also pass messages per-validation:
```typescript
await validator.validate(data, {
  messagesProvider: new SimpleMessagesProvider(messages),
})
```

## Validator File Organisation

Convention: one file per entity in `app/validators/`:

```typescript
// app/validators/post.ts
import vine from '@vinejs/vine'

export const createPostValidator = vine.compile(
  vine.object({
    title: vine.string().trim().minLength(1).maxLength(255),
    body: vine.string().trim(),
    status: vine.enum(['draft', 'published']),
    tags: vine.array(vine.number()).optional(),
  })
)

export const updatePostValidator = vine
  .withMetaData<{ resourceId: number }>()
  .compile(
    vine.object({
      title: vine.string().trim().minLength(1).maxLength(255),
      body: vine.string().trim(),
      status: vine.enum(['draft', 'published']),
      tags: vine.array(vine.number()).optional(),
    })
  )
```

### Validator Factory for Repetitive Entities

If multiple entities share the same shape (e.g. name-only CRUD), use a factory:

```typescript
// app/validators/base/helpers.ts
import vine from '@vinejs/vine'

export function createNameValidator(tableName: string) {
  return vine.compile(
    vine.object({
      name: vine.string().trim().minLength(1).unique(async (db, value) => {
        const row = await db.from(tableName).where('name', value).first()
        return !row
      }),
    })
  )
}

export function updateNameValidator(tableName: string) {
  return vine.withMetaData<{ resourceId: number }>().compile(
    vine.object({
      name: vine.string().trim().minLength(1).unique(async (db, value, field) => {
        const row = await db
          .from(tableName)
          .where('name', value)
          .whereNot('id', field.meta.resourceId)
          .first()
        return !row
      }),
    })
  )
}
```

## Common Real-World Patterns

### Login Form
```typescript
export const loginValidator = vine.compile(
  vine.object({
    email: vine.string().trim().email(),
    password: vine.string(),
  })
)
```

### Registration Form
```typescript
export const registerValidator = vine.compile(
  vine.object({
    username: vine.string().trim().minLength(3).maxLength(30).alphaNumeric(),
    email: vine.string().trim().email().unique(async (db, value) => {
      const row = await db.from('users').where('email', value).first()
      return !row
    }),
    password: vine.string().minLength(8).maxLength(32).confirmed(),
  })
)
```

### Multi-select / Many-to-Many
```typescript
// For checkbox groups or multi-select dropdowns
vine.object({
  genres: vine.array(vine.number()).optional(),   // array of IDs
  tags: vine.array(vine.number()).optional(),
})
```

### Enum with Optional
```typescript
vine.object({
  status: vine.enum(['draft', 'published', 'archived']),
  priority: vine
    .enum(['low', 'medium', 'high', 'critical'])
    .optional(),
})
```

### Regex Pattern (e.g. duration mm:ss)
```typescript
vine.object({
  duration: vine.string().trim().regex(/^\d{1,3}:[0-5]\d$/).optional(),
})
```

## Further Reference

For advanced features (extending schemas, macros, custom types, error reporters),
use the Context7 MCP server with `context7-compatible-id: /vinejs/vinejs.dev`.
