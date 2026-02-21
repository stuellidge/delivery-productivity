import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'pulse_aggregates'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('delivery_stream_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('delivery_streams')
        .onDelete('CASCADE')
      table.string('survey_period', 7).notNullable() // YYYY-MM
      table.integer('response_count').notNullable().defaultTo(0)
      table.integer('team_size').nullable()
      table.decimal('response_rate_pct', 5, 2).nullable()
      table.decimal('pace_avg', 4, 2).nullable()
      table.decimal('pace_trend', 4, 2).nullable()
      table.decimal('tooling_avg', 4, 2).nullable()
      table.decimal('tooling_trend', 4, 2).nullable()
      table.decimal('clarity_avg', 4, 2).nullable()
      table.decimal('clarity_trend', 4, 2).nullable()
      table.decimal('overall_avg', 4, 2).nullable()
      table.timestamp('computed_at', { useTz: true }).notNullable()

      table.unique(['delivery_stream_id', 'survey_period'])
      table.index(['delivery_stream_id', 'survey_period'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
