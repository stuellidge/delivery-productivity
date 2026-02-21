import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'deployment_records'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
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
      table
        .integer('repo_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('repositories')
        .onDelete('SET NULL')
      table.string('environment', 100).notNullable()
      table
        .string('status', 50)
        .notNullable()
        .checkIn(['success', 'failed', 'rolled_back', 'cancelled'])
      table.string('commit_sha', 255).nullable()
      table.string('pipeline_id', 255).nullable()
      table.string('trigger_type', 100).nullable()
      table.integer('linked_pr_number').nullable()
      table.string('linked_ticket_id', 100).nullable()
      table.decimal('lead_time_hrs', 10, 2).nullable()
      table.boolean('caused_incident').notNullable().defaultTo(false)
      table.string('incident_id', 255).nullable()
      table.timestamp('deployed_at', { useTz: true }).notNullable()
      table.timestamp('rollback_at', { useTz: true }).nullable()
      table.timestamp('created_at', { useTz: true }).notNullable()

      table.index(['tech_stream_id', 'environment', 'deployed_at'])
      table.index(['environment', 'deployed_at'])
      table.index(['linked_ticket_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
