import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import env from '#start/env'

/**
 * Single-tenant API gate (PRD §9.6).
 *
 * Local desktop runs with no API_KEY set — no gate, no egress. Each cloud
 * instance sets one API_KEY; requests must present it as a bearer token. This is
 * deliberately simple: one tenant per deployment, so there is no user table to
 * manage, just a shared secret for the one subscriber who owns the instance.
 */
export default class ApiKeyMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const configured = env.get('API_KEY')
    if (!configured) return next() // local mode: open

    const header = ctx.request.header('authorization') ?? ''
    const token = header.replace(/^Bearer\s+/i, '').trim()
    if (token !== configured) {
      return ctx.response.unauthorized({ error: 'Invalid or missing API key' })
    }
    return next()
  }
}
