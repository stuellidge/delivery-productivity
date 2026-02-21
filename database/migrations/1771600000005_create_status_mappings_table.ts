import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'status_mappings'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.string('jira_project_key', 50).notNullable()
      table.string('jira_status_name', 255).notNullable()
      table
        .enum('pipeline_stage', [
          'backlog',
          'ba',
          'dev',
          'code_review',
          'qa',
          'uat',
          'done',
          'cancelled',
        ])
        .notNullable()
      table.boolean('is_active_work').notNullable()
      table.integer('display_order').notNullable().defaultTo(0)

      table.unique(['jira_project_key', 'jira_status_name'])
      table.index(['jira_project_key'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
