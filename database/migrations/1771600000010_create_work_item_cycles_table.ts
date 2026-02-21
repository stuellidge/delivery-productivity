import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'work_item_cycles'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.string('ticket_id', 50).notNullable().unique()
      table
        .integer('delivery_stream_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('delivery_streams')
        .onDelete('SET NULL')
      table.specificType('tech_stream_ids', 'integer[]').nullable()
      table.string('ticket_type', 50).nullable()
      table.decimal('story_points', 5, 1).nullable()
      table.timestamp('created_at_source', { useTz: true }).notNullable()
      table.timestamp('first_in_progress', { useTz: true }).nullable()
      table.timestamp('completed_at', { useTz: true }).notNullable()
      table.decimal('lead_time_days', 8, 2).notNullable()
      table.decimal('cycle_time_days', 8, 2).notNullable()
      table.decimal('active_time_days', 8, 2).notNullable()
      table.decimal('wait_time_days', 8, 2).notNullable()
      table.decimal('flow_efficiency_pct', 5, 2).notNullable()
      table.jsonb('stage_durations').notNullable().defaultTo('{}')
      table
        .integer('sprint_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('sprints')
        .onDelete('SET NULL')

      table.index(['delivery_stream_id', 'completed_at'])
      table.index(['completed_at'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
