import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pr_cycles'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()

      // Repository and stream references
      table
        .integer('repo_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('repositories')
        .onDelete('CASCADE')
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

      // PR identification
      table.integer('pr_number').unsigned().notNullable()
      table.string('linked_ticket_id', 50).nullable()
      table.string('author_hash', 64).nullable()

      // Timeline events
      table.timestamp('opened_at', { useTz: true }).notNullable()
      table.timestamp('first_review_at', { useTz: true }).nullable()
      table.timestamp('approved_at', { useTz: true }).nullable()
      table.timestamp('merged_at', { useTz: true }).nullable()

      // Computed metrics
      table.decimal('time_to_first_review_hrs', 10, 2).nullable()
      table.decimal('time_to_merge_hrs', 10, 2).nullable()
      table.integer('review_rounds').nullable()
      table.specificType('reviewer_hashes', 'text[]').nullable()
      table.integer('reviewer_count').nullable()
      table.integer('lines_changed').nullable()
      table.integer('files_changed').nullable()

      // One cycle record per PR
      table.unique(['repo_id', 'pr_number'])
      table.index(['tech_stream_id', 'merged_at'])
      table.index(['delivery_stream_id', 'merged_at'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
