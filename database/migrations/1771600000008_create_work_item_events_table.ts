import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'work_item_events'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()

      // Common event columns
      table.string('source', 50).notNullable().defaultTo('jira')
      table
        .integer('delivery_stream_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('delivery_streams')
        .onDelete('SET NULL')
      table
        .integer('tech_stream_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('tech_streams')
        .onDelete('SET NULL')
      table.timestamp('received_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('event_timestamp', { useTz: true }).notNullable()

      // Work item specific columns
      table
        .enum('event_type', [
          'created',
          'transitioned',
          'completed',
          'blocked',
          'unblocked',
          'flagged',
          'unflagged',
        ])
        .notNullable()
      table.string('ticket_id', 50).notNullable()
      table.string('ticket_type', 50).nullable()
      table.string('from_stage', 50).nullable()
      table.string('to_stage', 50).nullable()
      table.string('assignee_hash', 64).nullable()
      table.decimal('story_points', 5, 1).nullable()
      table.string('priority', 50).nullable()
      table
        .integer('sprint_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('sprints')
        .onDelete('SET NULL')
      table.specificType('labels', 'text[]').nullable()
      table.text('blocked_reason').nullable()
      table
        .integer('blocking_tech_stream_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('tech_streams')
        .onDelete('SET NULL')

      // Dedup constraint: one event per ticket per type per timestamp
      table.unique(['ticket_id', 'event_type', 'event_timestamp'])
      table.index(['ticket_id'])
      table.index(['delivery_stream_id', 'event_timestamp'])
      table.index(['to_stage', 'event_timestamp'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
