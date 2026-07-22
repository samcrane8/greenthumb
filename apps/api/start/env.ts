/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| The `Env.create` method creates an instance of the Env service. The
| service validates the environment variables and also cast values
| to JavaScript data types.
|
*/

import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  APP_KEY: Env.schema.string(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']),

  /*
  |--------------------------------------------------------------------------
  | Storage & persistence
  |--------------------------------------------------------------------------
  */
  DB_PATH: Env.schema.string.optional(),
  // Directory where model JSON files live (local-first, diffable, git-versionable).
  MODELS_DIR: Env.schema.string.optional(),

  /*
  |--------------------------------------------------------------------------
  | Single-tenant API auth
  |--------------------------------------------------------------------------
  | When set, requests must carry `Authorization: Bearer <API_KEY>`. Leave unset
  | for local desktop use (no egress, no gate); set it for each cloud instance.
  */
  API_KEY: Env.schema.string.optional(),

  /*
  |--------------------------------------------------------------------------
  | Market-data provider keys (LOCAL config only — never in model JSON or git)
  |--------------------------------------------------------------------------
  | Optional. The keyless default provider (Stooq) needs none.
  */
  ALPHAVANTAGE_API_KEY: Env.schema.string.optional(),
  /** Where provider keys are stored locally. Override in tests to isolate. */
  PROVIDERS_CONFIG_PATH: Env.schema.string.optional(),
})
