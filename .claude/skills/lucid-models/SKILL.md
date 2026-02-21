---
name: lucid-models
description: >
  Define and work with AdonisJS v6 Lucid ORM models including column decorators,
  relationships, DateTime handling, naming strategies, serialization, hooks, query
  scopes, and CRUD operations. Use when creating models, defining relationships,
  working with database records, or serializing model data to JSON.
---

# Lucid ORM Models (AdonisJS v6)

## Critical: v6 Syntax

AdonisJS v6 uses `declare` (not `public`) for model properties and imports from
`@adonisjs/lucid/orm`, not `@ioc:Adonis/Lucid/Orm`.

## Model Definition

```typescript
import { DateTime } from 'luxon'
import { BaseModel, column, hasMany, belongsTo, manyToMany } from '@adonisjs/lucid/orm'
import type { HasMany, BelongsTo, ManyToMany } from '@adonisjs/lucid/types/relations'

export default class Post extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare title: string

  @column()
  declare userId: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @hasMany(() => Comment)
  declare comments: HasMany<typeof Comment>

  @manyToMany(() => Tag)
  declare tags: ManyToMany<typeof Tag>
}
```

## Column Decorators

| Decorator                                                  | Use for                                    |
| ---------------------------------------------------------- | ------------------------------------------ |
| `@column()`                                                | Standard columns (string, number, boolean) |
| `@column({ isPrimary: true })`                             | Primary key                                |
| `@column({ columnName: 'custom_name' })`                   | Override auto snake_case mapping           |
| `@column({ serializeAs: 'apiName' })`                      | Rename in JSON output                      |
| `@column({ serializeAs: null })`                           | Hide from JSON output (e.g. password)      |
| `@column.dateTime({ autoCreate: true })`                   | Auto-set on create (createdAt)             |
| `@column.dateTime({ autoCreate: true, autoUpdate: true })` | Auto-set on create and update (updatedAt)  |

## Naming Strategy

Lucid's `CamelCaseNamingStrategy` automatically maps:

- Model property `createdAt` → database column `created_at`
- Model property `userId` → database column `user_id`

This applies to model queries only. Raw queries (`db.rawQuery`, `db.from`) require
actual database column names.

Override per-column: `@column({ columnName: 'my_col' })`

## DateTime Handling — CRITICAL

```typescript
// ❌ WRONG — .toISODate() returns a string, not DateTime
await Post.create({ publishedAt: DateTime.now().toISODate()! })

// ✅ CORRECT — pass DateTime objects to model properties
await Post.create({ publishedAt: DateTime.now() })
```

Use `.toISODate()` only for form data in tests or string comparisons.

Custom serialization:

```typescript
@column.dateTime({
  autoCreate: true,
  serialize: (value: DateTime | null) => {
    return value ? value.setZone('utc').toISO() : value
  },
})
declare createdAt: DateTime
```

## Relationships

```typescript
import { hasOne, hasMany, belongsTo, manyToMany, hasManyThrough } from '@adonisjs/lucid/orm'
import type {
  HasOne,
  HasMany,
  BelongsTo,
  ManyToMany,
  HasManyThrough,
} from '@adonisjs/lucid/types/relations'
```

| Decorator                | Type Import              | Foreign Key Convention |
| ------------------------ | ------------------------ | ---------------------- |
| `@hasOne(() => Profile)` | `HasOne<typeof Profile>` | `profiles.user_id`     |
| `@hasMany(() => Post)`   | `HasMany<typeof Post>`   | `posts.user_id`        |
| `@belongsTo(() => User)` | `BelongsTo<typeof User>` | `posts.user_id`        |
| `@manyToMany(() => Tag)` | `ManyToMany<typeof Tag>` | pivot table `post_tag` |

Always preload relationships to avoid N+1 queries:

```typescript
const users = await User.query().preload('posts')
```

## Many-to-Many: attach vs sync

```typescript
// CREATE — use attach() to add relationships
await post.related('tags').attach([1, 2, 3])

// UPDATE — use sync() to replace ALL relationships
// sync() removes old ones and adds new ones atomically
await post.related('tags').sync([2, 3, 4])

// ❌ WRONG on update — attach() only adds, doesn't remove old ones
await post.related('tags').attach([2, 3, 4])
```

## CRUD Operations

```typescript
// Create
const user = await User.create({ email: 'a@b.com', password: 'secret' })

// Find
const user = await User.find(1) // returns null if not found
const user = await User.findOrFail(1) // throws E_ROW_NOT_FOUND (404)
const user = await User.findByOrFail('email', 'a@b.com')

// Update
const user = await User.findOrFail(1)
user.merge({ email: 'new@b.com' })
await user.save()

// Delete
const user = await User.findOrFail(1)
await user.delete()

// Bulk create / upsert
await User.createMany([{ email: 'a@b.com' }, { email: 'c@d.com' }])
await User.updateOrCreateMany('email', [
  { email: 'a@b.com', name: 'Alice' },
  { email: 'c@d.com', name: 'Carol' },
])
```

## Query Builder

```typescript
const users = await User.query()
  .where('countryCode', 'GB')
  .orWhereNull('countryCode')
  .preload('posts')
  .orderBy('createdAt', 'desc')
  .paginate(page, limit)
```

## Query Scopes

```typescript
import { scope } from '@adonisjs/lucid/orm'

export default class Post extends BaseModel {
  static published = scope((query) => {
    query.whereNotNull('publishedAt')
  })

  static visibleTo = scope((query, user: User) => {
    if (!user.isAdmin) {
      query.where('teamId', user.teamId)
    }
  })
}

// Usage
await Post.query().withScopes((scopes) => scopes.published())
await Post.query().withScopes((scopes) => scopes.visibleTo(currentUser))
```

## Model Hooks

```typescript
import { beforeCreate, beforeSave, beforeFind, beforePaginate } from '@adonisjs/lucid/orm'

export default class User extends BaseModel {
  @beforeSave()
  static async hashPassword(user: User) {
    if (user.$dirty.password) {
      user.password = await hash.make(user.password)
    }
  }
}
```

Available hooks: `beforeCreate`, `afterCreate`, `beforeUpdate`, `afterUpdate`,
`beforeSave`, `afterSave`, `beforeDelete`, `afterDelete`, `beforeFind`, `afterFind`,
`beforeFetch`, `afterFetch`, `beforePaginate`, `afterPaginate`.

## Serialization

```typescript
// Hide password from JSON
@column({ serializeAs: null })
declare password: string

// Rename in JSON output
@column({ serializeAs: 'content' })
declare body: string

// Serialize with selected fields
const post = await Post.find(1)
post.serialize({ fields: ['id', 'title'] })

// Serialize relationships
post.serialize({
  fields: ['id', 'title'],
  relations: {
    comments: { fields: ['id', 'body'] }
  }
})
```

## Generate Model

```bash
node ace make:model Post        # model only
node ace make:model Post -m     # model + migration (preferred)
node ace make:model Post -f     # model + factory
node ace make:model Post -mf    # model + migration + factory
```

## Further Reference

For APIs not covered here (factories, transactions, raw queries), use the Context7 MCP
server with `context7-compatible-id: lucid_adonisjs`.
