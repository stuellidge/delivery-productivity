import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pulse_responses'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.string('source', 100).notNullable()
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
      table.timestamp('received_at', { useTz: true }).notNullable()
      table.timestamp('event_timestamp', { useTz: true }).notNullable()
      table.string('survey_period', 7).notNullable() // YYYY-MM
      table.string('respondent_hash', 255).notNullable()
      table.integer('pace_score').notNullable().checkBetween([1, 5])
      table.integer('tooling_score').notNullable().checkBetween([1, 5])
      table.integer('clarity_score').notNullable().checkBetween([1, 5])
      table.text('free_text').nullable()

      // Upsert pattern — one response per respondent per period per delivery stream
      table.unique(['survey_period', 'respondent_hash', 'delivery_stream_id'])

      table.index(['delivery_stream_id', 'survey_period'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
