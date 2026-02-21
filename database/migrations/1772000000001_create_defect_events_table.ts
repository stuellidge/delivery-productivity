import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'defect_events'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()

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

      table
        .enum('event_type', ['logged', 'attributed', 'reclassified'])
        .notNullable()

      table.string('ticket_id', 100).notNullable()

      table
        .enum('severity', ['critical', 'high', 'medium', 'low'])
        .nullable()

      table.string('found_in_stage', 50).notNullable()
      table.string('introduced_in_stage', 50).nullable()
      table.string('linked_work_item_id', 100).nullable()
      table.string('root_cause_category', 100).nullable()

      // Dedup constraint
      table.unique(['ticket_id', 'event_type', 'event_timestamp'])

      table.index(['delivery_stream_id', 'found_in_stage'])
      table.index(['event_timestamp'])
      table.index(['ticket_id', 'event_timestamp'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
