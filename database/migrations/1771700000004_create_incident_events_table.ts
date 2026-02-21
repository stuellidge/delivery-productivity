import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'incident_events'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .string('event_type', 100)
        .notNullable()
        .checkIn(['alarm_triggered', 'alarm_resolved', 'incident_opened', 'incident_resolved'])
      table.string('incident_id', 255).notNullable()
      table.string('service_name', 255).notNullable()
      table.string('severity', 50).nullable().checkIn(['critical', 'high', 'medium', 'low'])
      table.text('description').nullable()
      table
        .integer('tech_stream_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('tech_streams')
        .onDelete('CASCADE')
      table
        .integer('related_deploy_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('deployment_records')
        .onDelete('SET NULL')
      table.timestamp('resolved_at', { useTz: true }).nullable()
      table.integer('time_to_restore_min').nullable()
      table.timestamp('occurred_at', { useTz: true }).notNullable()
      table.timestamp('created_at', { useTz: true }).notNullable()

      table.unique(['incident_id', 'event_type'])
      table.index(['tech_stream_id', 'occurred_at'])
      table.index(['incident_id'])
      table.index(['related_deploy_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
