import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Actuals live in SQLite (not the model JSON) because historical time-series get
 * large and are queried by range (PRD §9.2). A row is one (model, item, period)
 * observed value with its import provenance.
 */
export default class extends BaseSchema {
  protected tableName = 'actuals'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('model_id').notNullable().index()
      table.string('item_id').notNullable()
      table.integer('period').notNullable()
      table.double('value').notNullable()
      table.string('source').nullable() // e.g. "csv:april.csv", "stripe"
      table.timestamp('created_at').notNullable()
      table.unique(['model_id', 'item_id', 'period'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
