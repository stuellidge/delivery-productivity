import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'oidc_group_mappings'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.string('provider').notNullable().defaultTo('microsoft')
      table.string('group_pattern').notNullable()
      table.boolean('is_regex').defaultTo(false).notNullable()
      table.enu('role', ['viewer', 'team_member', 'stream_lead', 'platform_admin']).notNullable()
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
        .integer('created_by')
        .unsigned()
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL')
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
