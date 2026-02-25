import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'platform_settings'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('key', 100).unique().notNullable()
      table.jsonb('value').notNullable()
      table.text('description').nullable()
      table.timestamp('updated_at', { useTz: true }).defaultTo(this.db.rawQuery('NOW()').knexQuery)
      table.integer('updated_by').nullable().references('id').inTable('users').onDelete('SET NULL')
    })

    this.defer(async (db) => {
      await db.table(this.tableName).insert({
        key: 'cross_stream_severity_thresholds',
        value: JSON.stringify([
          { minStreams: 3, maxConfidence: 60, severity: 'critical' },
          { minStreams: 2, maxConfidence: 70, severity: 'high' },
          { minStreams: 2, maxConfidence: 100, severity: 'medium' },
          { minStreams: 1, maxConfidence: 70, severity: 'medium' },
          { minStreams: 1, maxConfidence: 100, severity: 'low' },
        ]),
        description:
          'Severity thresholds for cross-stream correlation. Evaluated in order; first match wins.',
      })
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
