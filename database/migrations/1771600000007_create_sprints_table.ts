import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'sprints'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.string('jira_sprint_id', 255).notNullable().unique()
      table
        .integer('delivery_stream_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('delivery_streams')
        .onDelete('SET NULL')
      table.string('name', 255).notNullable()
      table.date('start_date').notNullable()
      table.date('end_date').notNullable()
      table.text('goal').nullable()
      table.enum('state', ['future', 'active', 'closed']).notNullable().defaultTo('future')

      table.index(['delivery_stream_id', 'state'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
