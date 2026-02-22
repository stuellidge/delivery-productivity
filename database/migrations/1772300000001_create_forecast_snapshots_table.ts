import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'forecast_snapshots'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table
        .integer('delivery_stream_id')
        .unsigned()
        .references('id')
        .inTable('delivery_streams')
        .onDelete('CASCADE')
        .notNullable()
      table.date('forecast_date').notNullable()
      table.integer('scope_item_count').notNullable()
      table.integer('throughput_samples').notNullable()
      table.integer('simulation_runs').notNullable().defaultTo(10000)
      table.date('p50_completion_date').nullable()
      table.date('p70_completion_date').nullable()
      table.date('p85_completion_date').nullable()
      table.date('p95_completion_date').nullable()
      table.jsonb('distribution_data').nullable()
      table.timestamp('computed_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.unique(['delivery_stream_id', 'forecast_date'])
      table.index(['delivery_stream_id', 'forecast_date'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
