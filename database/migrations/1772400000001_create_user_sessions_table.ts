import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'user_sessions'

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
      table
        .string('auth_method', 20)
        .notNullable()
        .checkIn(['oidc', 'database'], 'chk_user_sessions_auth_method')
      table.string('platform_token', 64).notNullable().unique()
      table.timestamp('expires_at', { useTz: true }).notNullable()
      table.timestamp('last_activity_at', { useTz: true }).nullable()
      table.boolean('is_revoked').notNullable().defaultTo(false)

      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()

      table.index(['user_id', 'is_revoked'])
      table.index('platform_token')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
