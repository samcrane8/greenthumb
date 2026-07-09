/**
 * Resolve which API the web client should talk to.
 *
 * A single built bundle can run against the local API (default) or a chosen
 * cloud instance. The cloud connection lives in client settings because it
 * selects *which* API to call — it cannot live on that API. When connected, the
 * cloud URL + key win; otherwise we fall back to the build-time env (local
 * same-origin `/api`). Kept pure and dependency-free so it is unit-testable.
 */

export interface CloudConnection {
  url: string
  apiKey: string
  connected: boolean
}

export interface EnvFallback {
  base: string
  key?: string
}

export interface ApiTarget {
  /** Base origin with any trailing slash stripped. May be '' for same-origin. */
  base: string
  /** Bearer key, or undefined when none is configured. */
  key?: string
}

const stripTrailingSlash = (s: string) => s.replace(/\/+$/, '')

export function resolveTarget(cloud: CloudConnection, env: EnvFallback): ApiTarget {
  if (cloud.connected && cloud.url.trim()) {
    return {
      base: stripTrailingSlash(cloud.url.trim()),
      key: cloud.apiKey.trim() || undefined,
    }
  }
  return { base: stripTrailingSlash(env.base), key: env.key || undefined }
}
