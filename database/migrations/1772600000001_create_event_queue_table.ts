import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'event_queue'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table
        .string('event_source', 50)
        .notNullable()
        .comment('jira | github | deployment | incident')
      table.string('event_type', 100).nullable().comment('GitHub x-github-event header value')
      table.string('signature', 500).nullable().comment('GitHub x-hub-signature-256 header value')
      table.jsonb('payload').notNullable()
      table
        .string('status', 20)
        .notNullable()
        .defaultTo('pending')
        .comment('pending | processing | completed | dead_lettered')
      table.integer('attempt_count').notNullable().defaultTo(0)
      table.text('last_error').nullable()
      table
        .timestamp('enqueued_at', { useTz: true })
        .notNullable()
        .defaultTo(this.db.rawQuery('NOW()').knexQuery)
      table.timestamp('processed_at', { useTz: true }).nullable()

      table.index(['status', 'enqueued_at'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
