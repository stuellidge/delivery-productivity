import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'delivery_streams'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('team_size').unsigned().nullable().after('is_active')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('team_size')
    })
  }
}
