import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'cicd_events'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()

      table.string('source', 50).notNullable().defaultTo('github')

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
        .enum('event_type', [
          'build_started',
          'build_completed',
          'deploy_started',
          'deploy_completed',
          'deploy_failed',
          'rollback_initiated',
          'rollback_completed',
        ])
        .notNullable()

      table.string('pipeline_id', 255).notNullable()
      table.string('pipeline_run_id', 255).notNullable()
      table.string('environment', 100).notNullable()
      table.string('status', 50).notNullable()
      table.integer('duration_seconds').nullable()
      table.string('commit_sha', 64).nullable()
      table.integer('linked_pr_number').nullable()
      table.string('linked_ticket_id', 100).nullable()
      table.string('trigger_type', 100).nullable()
      table.string('artefact_version', 255).nullable()
      table.text('failure_reason').nullable()

      // Dedup constraint
      table.unique(['pipeline_id', 'pipeline_run_id', 'event_type'])

      table.index(['environment', 'status', 'event_timestamp'])
      table.index(['tech_stream_id', 'event_timestamp'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
