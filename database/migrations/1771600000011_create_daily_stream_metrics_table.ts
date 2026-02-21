import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'daily_stream_metrics'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.date('metric_date').notNullable()
      table.enum('stream_type', ['delivery', 'tech']).notNullable()
      table.integer('stream_id').unsigned().notNullable()
      table.string('metric_name', 100).notNullable()
      table.decimal('metric_value', 12, 4).notNullable()
      table.string('metric_unit', 50).notNullable()
      table.integer('percentile').nullable()
      table.integer('sample_size').notNullable()
      table.timestamp('computed_at', { useTz: true }).notNullable().defaultTo(this.now())

      table.unique(['metric_date', 'stream_type', 'stream_id', 'metric_name', 'percentile'])
      table.index(['stream_id', 'metric_name', 'metric_date'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
