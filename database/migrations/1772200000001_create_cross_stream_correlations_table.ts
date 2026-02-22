import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'cross_stream_correlations'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.date('analysis_date').notNullable()
      table.integer('tech_stream_id').references('id').inTable('tech_streams').notNullable()
      table.specificType('impacted_delivery_streams', 'integer[]').notNullable().defaultTo('{}')
      table.specificType('blocked_delivery_streams', 'integer[]').notNullable().defaultTo('{}')
      table.integer('block_count_14d').notNullable().defaultTo(0)
      table.decimal('avg_confidence_pct', 5, 2).nullable()
      table.decimal('avg_cycle_time_p85', 8, 2).nullable()
      table.string('severity', 20).notNullable().defaultTo('none')
      table.timestamp('computed_at', { useTz: true }).defaultTo(this.now())
      table.unique(['analysis_date', 'tech_stream_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
