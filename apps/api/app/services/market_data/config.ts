import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import app from '@adonisjs/core/services/app'
import env from '#start/env'

/**
 * Provider key configuration — LOCAL ONLY. Keys are read from env first, then a
 * local `storage/providers.json` (gitignored), and are NEVER written into model
 * JSON, returned to clients, or committed. This is the "local config" the safety
 * rules require for secrets.
 */

// Overridable so tests don't touch the real local config (never committed either way).
const CONFIG_PATH = env.get('PROVIDERS_CONFIG_PATH', app.makePath('storage/providers.json'))

/** Map a provider id to its env var name (env takes precedence over the file). */
const ENV_KEYS: Record<string, string> = {
  alphavantage: 'ALPHAVANTAGE_API_KEY',
  fred: 'FRED_API_KEY',
}

async function readFileConfig(): Promise<Record<string, string>> {
  try {
    return JSON.parse(await readFile(CONFIG_PATH, 'utf-8')) as Record<string, string>
  } catch {
    return {}
  }
}

/** The API key for a provider, from env or local config; undefined if none. */
export async function keyFor(providerId: string): Promise<string | undefined> {
  const envName = ENV_KEYS[providerId]
  const fromEnv = envName ? (env.get(envName as never) as string | undefined) : undefined
  if (fromEnv) return fromEnv
  const file = await readFileConfig()
  return file[providerId]
}

/** Whether a provider has a usable key configured (never reveals the value). */
export async function isConfigured(providerId: string): Promise<boolean> {
  return (await keyFor(providerId)) !== undefined
}

/** Persist a provider key to local config only. */
export async function setKey(providerId: string, key: string): Promise<void> {
  const file = await readFileConfig()
  file[providerId] = key
  await mkdir(dirname(CONFIG_PATH), { recursive: true })
  await writeFile(CONFIG_PATH, JSON.stringify(file, null, 2), 'utf-8')
}
