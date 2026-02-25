import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    // Add repo_id FK to cicd_events (§4.3.4)
    this.schema.table('cicd_events', (table) => {
      table
        .integer('repo_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('repositories')
        .onDelete('SET NULL')
        .after('tech_stream_id')

      table.index(['commit_sha'])
    })

    // Add missing index on defect_events.(tech_stream_id, event_timestamp) (§4.3.6)
    this.schema.table('defect_events', (table) => {
      table.index(['tech_stream_id', 'event_timestamp'])
    })
  }

  async down() {
    this.schema.table('cicd_events', (table) => {
      table.dropForeign(['repo_id'])
      table.dropIndex(['commit_sha'])
      table.dropColumn('repo_id')
    })

    this.schema.table('defect_events', (table) => {
      table.dropIndex(['tech_stream_id', 'event_timestamp'])
    })
  }
}
