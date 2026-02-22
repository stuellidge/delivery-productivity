import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'tech_streams'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('min_contributors').notNullable().defaultTo(6)
      table.string('ticket_regex', 500).nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('min_contributors')
      table.dropColumn('ticket_regex')
    })
  }
}
