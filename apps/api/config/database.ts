import app from '@adonisjs/core/services/app'
import env from '#start/env'
import { defineConfig } from '@adonisjs/lucid'

/**
 * SQLite is the one relational store for both the local desktop app and each
 * single-tenant cloud instance (PRD §9.2). It holds actuals time-series and
 * version snapshots; the models themselves live as diffable JSON files on disk
 * (see app/services/model_store.ts).
 */
const dbConfig = defineConfig({
  connection: 'sqlite',
  connections: {
    sqlite: {
      client: 'better-sqlite3',
      connection: {
        filename: env.get('DB_PATH', app.makePath('storage/greenthumb.sqlite')),
      },
      useNullAsDefault: true,
      migrations: {
        naturalSort: true,
        paths: ['database/migrations'],
      },
    },
  },
})

export default dbConfig
