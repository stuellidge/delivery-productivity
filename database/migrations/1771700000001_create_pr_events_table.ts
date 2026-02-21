import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pr_events'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()

      // Common event columns
      table.string('source', 50).notNullable().defaultTo('github')
      table
        .enum('event_type', [
          'opened',
          'review_submitted',
          'changes_requested',
          'approved',
          'merged',
          'closed',
        ])
        .notNullable()
      table.integer('pr_number').unsigned().notNullable()

      // Repository reference
      table
        .integer('repo_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('repositories')
        .onDelete('CASCADE')

      // GitHub-specific context
      table.string('github_org', 255).notNullable()
      table.string('github_repo', 255).notNullable()

      // Author and branch context
      table.string('author_hash', 64).nullable()
      table.string('branch_name', 255).nullable()
      table.string('linked_ticket_id', 50).nullable()
      table.string('base_branch', 255).nullable()

      // Code change metrics
      table.integer('lines_added').nullable()
      table.integer('lines_removed').nullable()
      table.integer('files_changed').nullable()

      // Review context
      table.string('reviewer_hash', 64).nullable()
      table.string('review_state', 50).nullable()
      table.integer('comments_count').nullable()

      // Stream references
      table
        .integer('tech_stream_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('tech_streams')
        .onDelete('CASCADE')
      table
        .integer('delivery_stream_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('delivery_streams')
        .onDelete('SET NULL')

      table.timestamp('event_timestamp', { useTz: true }).notNullable()
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())

      // Dedup constraint: one event per repo/PR/type/timestamp
      table.unique(['repo_id', 'pr_number', 'event_type', 'event_timestamp'])
      table.index(['linked_ticket_id'])
      table.index(['tech_stream_id', 'event_timestamp'])
      table.index(['repo_id', 'pr_number'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
