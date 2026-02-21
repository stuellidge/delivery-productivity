---
name: lucid-migrations
description: >
  Create and manage AdonisJS v6 Lucid ORM database migrations including schema
  creation, column types, table modifications, indexes, foreign keys, and rollback
  patterns. Use when creating migrations, modifying database schema, adding columns,
  creating indexes, or managing database structure.
---

# Lucid Migrations & Schema (AdonisJS v6)

## Migration Structure

```typescript
import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'posts'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE')
      table.string('title', 255).notNullable()
      table.text('body').nullable()
      table.boolean('is_published').defaultTo(false)
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
```

## Critical Rules

1. The `down()` method must reverse exactly what `up()` does
2. Always use `{ useTz: true }` for timestamp columns (timezone-aware)
3. Use `unsigned()` on foreign key integer columns
4. Production: never drop columns without a data migration plan

## Column Types

### Numeric
```typescript
table.increments('id')                    // Auto-increment primary key (serial in PG)
table.integer('count')                    // Standard integer
table.bigInteger('large_count')           // For values > 2^31
table.decimal('price', 8, 2)             // Precision and scale
table.float('score')                      // Floating point
table.boolean('is_active')               // Boolean
```

### String / Text
```typescript
table.string('name', 255)                // VARCHAR(255) — always specify length
table.text('body')                        // Unlimited text
table.uuid('uuid')                        // UUID type
table.enum('status', ['pending', 'done']) // Enum column
table.json('metadata')                    // JSON column
table.jsonb('metadata')                   // JSONB column (PostgreSQL — prefer this)
```

### Date / Time
```typescript
table.timestamp('created_at', { useTz: true })   // Timestamp with timezone
table.date('date_of_birth')                       // Date only (no time)
table.dateTime('scheduled_at', { useTz: true })   // Alias for timestamp
```

### Binary
```typescript
table.binary('file_data')                // Binary/blob data
```

## Column Modifiers

```typescript
table.string('email').notNullable().unique()
table.integer('sort_order').defaultTo(0)
table.string('nickname').nullable()           // columns are nullable by default in PG
table.string('slug').index()                  // single column index
table.integer('user_id').unsigned()           // required for FK references to increments()
```

## Foreign Keys

```typescript
// Inline (preferred for simple cases)
table.integer('user_id')
  .unsigned()
  .references('id')
  .inTable('users')
  .onDelete('CASCADE')

// Separate constraint (for composite or named constraints)
table.integer('user_id').unsigned()
table.foreign('user_id')
  .references('users.id')
  .onDelete('CASCADE')
  .onUpdate('CASCADE')
```

## Indexes

```typescript
// Single column
table.index(['email'])

// Composite index
table.index(['user_id', 'created_at'])

// Unique index
table.unique(['email'])

// Composite unique
table.unique(['user_id', 'slug'])

// Named index
table.index(['email'], 'idx_users_email')
```

## Altering Tables

```typescript
async up() {
  this.schema.alterTable('users', (table) => {
    table.string('avatar_url', 512).nullable()
    table.boolean('is_verified').defaultTo(false)
  })
}

async down() {
  this.schema.alterTable('users', (table) => {
    table.dropColumn('avatar_url')
    table.dropColumn('is_verified')
  })
}
```

## Renaming / Dropping

```typescript
// Rename column
this.schema.alterTable('users', (table) => {
  table.renameColumn('name', 'full_name')
})

// Drop column
this.schema.alterTable('users', (table) => {
  table.dropColumn('legacy_field')
})

// Rename table
this.schema.renameTable('posts', 'articles')

// Drop table
this.schema.dropTable('temp_data')

// Drop if exists
this.schema.dropTableIfExists('temp_data')
```

## Raw SQL in Migrations

```typescript
async up() {
  this.schema.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
}
```

## CLI Commands

```bash
node ace make:migration create_posts        # Create migration
node ace make:migration --connection=tenant  # For specific connection
node ace migration:run                       # Run pending migrations
node ace migration:rollback                  # Rollback last batch
node ace migration:rollback --batch=0        # Rollback all
node ace migration:fresh                     # Drop all + re-run
node ace migration:fresh --seed              # Drop all + re-run + seed
node ace migration:status                    # Show migration status
```

***Preferred: create a Lucid model and migration together with `node ace make:model Post -m`.***

## Running Migrations for Tests

After creating new migrations, you must run them against the test database before
tests will find the new tables:

```bash
NODE_ENV=test node ace migration:run
```

## Configuration

Migrations config in `config/database.ts` under each connection:

```typescript
migrations: {
  naturalSort: true,                  // Sort by filename naturally
  paths: ['database/migrations'],     // Migration file paths
  disableRollbacksInProduction: true, // Safety: prevent rollbacks in prod
  disableTransactions: false,         // Each migration runs in a transaction
  tableName: 'adonis_schema',        // Migration tracking table
}
```

## Common Patterns

### Soft Deletes
```typescript
table.timestamp('deleted_at', { useTz: true }).nullable()
```

### Polymorphic Columns
```typescript
table.string('commentable_type')   // e.g. 'Post', 'Video'
table.integer('commentable_id').unsigned()
table.index(['commentable_type', 'commentable_id'])
```

### Pivot Table (many-to-many)
```typescript
// Convention: singular model names in alphabetical order → post_tag
this.schema.createTable('post_tag', (table) => {
  table.increments('id')
  table.integer('post_id').unsigned().references('id').inTable('posts').onDelete('CASCADE')
  table.integer('tag_id').unsigned().references('id').inTable('tags').onDelete('CASCADE')
  table.unique(['post_id', 'tag_id'])
  table.timestamp('created_at', { useTz: true })
})
```

## Further Reference

For schema builder methods, column modifiers, or dialect-specific behaviour not covered
here, use the Context7 MCP server with `context7-compatible-id: lucid_adonisjs`.
