import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'sprint_snapshots'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()

      // Common event columns
      table.string('source', 50).notNullable().defaultTo('jira')
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
      table.timestamp('received_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('event_timestamp', { useTz: true }).notNullable()

      // Sprint snapshot specific columns
      table
        .integer('sprint_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('sprints')
        .onDelete('CASCADE')
      table.date('snapshot_date').notNullable()
      table.integer('committed_count').notNullable().defaultTo(0)
      table.integer('completed_count').notNullable().defaultTo(0)
      table.integer('remaining_count').notNullable().defaultTo(0)
      table.integer('added_after_start').notNullable().defaultTo(0)
      table.integer('removed_after_start').notNullable().defaultTo(0)
      table.integer('wip_ba').notNullable().defaultTo(0)
      table.integer('wip_dev').notNullable().defaultTo(0)
      table.integer('wip_qa').notNullable().defaultTo(0)
      table.integer('wip_uat').notNullable().defaultTo(0)

      // One snapshot per sprint per day (upsert)
      table.unique(['sprint_id', 'snapshot_date'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
