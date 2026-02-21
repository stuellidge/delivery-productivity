import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'user_roles'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('user_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')
      table.string('role', 50).notNullable()
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
      table
        .integer('granted_by')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
      table.timestamp('granted_at', { useTz: true }).notNullable()

      table.unique(['user_id', 'role', 'delivery_stream_id', 'tech_stream_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
