import type { HttpContext } from '@adonisjs/core/http'
import env from '#start/env'
import pkg from '../../package.json' with { type: 'json' }

/**
 * Deployment posture endpoint (read-only, ungated).
 *
 * Reports whether this instance is open (local desktop, no API_KEY) or gated
 * (cloud, shared-secret). The web client reads this to render the Local vs Cloud
 * account state and to validate a cloud connection. It returns NO secrets — only
 * whether a key is required, which an unauthenticated client could already infer
 * from a 401. Declared outside the apiKey() group so it is reachable without a
 * bearer token.
 */
export default class InfoController {
  /** GET /api/info — { mode, requiresApiKey, version }. */
  async show({ response }: HttpContext) {
    const requiresApiKey = Boolean(env.get('API_KEY'))
    return response.ok({
      mode: requiresApiKey ? 'cloud' : 'local',
      requiresApiKey,
      version: pkg.version ?? '0.0.0',
    })
  }
}
