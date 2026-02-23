import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'audit_log'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('actor_user_id')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
      // Snapshot of email at time of action — preserved even if user is deleted
      table.string('actor_email', 255).notNullable()
      table.string('action', 100).notNullable()
      table.string('entity_type', 100).nullable()
      table.string('entity_id', 255).nullable()
      table.jsonb('detail').nullable()
      table.string('ip_address', 45).nullable()

      table.timestamp('created_at', { useTz: true }).notNullable()

      table.index(['actor_user_id', 'created_at'])
      table.index(['action', 'created_at'])
      table.index(['entity_type', 'entity_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
