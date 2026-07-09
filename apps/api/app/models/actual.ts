import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

/** One observed historical value for (model, item, period). See the migration. */
export default class Actual extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare modelId: string

  @column()
  declare itemId: string

  @column()
  declare period: number

  @column()
  declare value: number

  @column()
  declare source: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime
}
