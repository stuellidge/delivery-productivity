import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'repositories'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table
        .integer('tech_stream_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('tech_streams')
        .onDelete('CASCADE')
      table.string('github_org', 255).notNullable()
      table.string('github_repo_name', 255).notNullable()
      table.string('full_name', 511).notNullable()
      table.string('default_branch', 100).notNullable().defaultTo('main')
      table.boolean('is_deployable').notNullable().defaultTo(true)
      table.string('deploy_target', 255).nullable()
      table.boolean('is_active').notNullable().defaultTo(true)

      table.unique(['github_org', 'github_repo_name'])
      table.index(['tech_stream_id'])

      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
