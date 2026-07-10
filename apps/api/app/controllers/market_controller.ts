import type { HttpContext } from '@adonisjs/core/http'
import { resolveItemId, setAssumption, type Model } from '@greenthumb/core'

import { modelStore } from '#services/model_store'
import { actualsStore } from '#services/actuals_store'
import {
  listProviders,
  getProvider,
  keyFor,
  isConfigured,
  setKey,
  cached,
  alignHistoryToTimeline,
  DEFAULT_PROVIDER,
} from '#services/market_data/index'

/**
 * Market-data endpoints — fetch quotes/history from a provider and MATERIALIZE
 * them into a model (as actuals, or a seeded driver). All I/O lives here, not in
 * core; compute never fetches. Keys stay in local config and are never returned.
 */
export default class MarketController {
  /** Resolve the provider from the query, defaulting to the keyless one. */
  async #provider(providerId: string | undefined) {
    const id = providerId || DEFAULT_PROVIDER
    const provider = getProvider(id)
    if (!provider) throw new Error(`Unknown data provider: ${id}`)
    const key = provider.requiresKey ? await keyFor(id) : undefined
    if (provider.requiresKey && !key) throw new Error(`Provider ${id} requires an API key (not configured)`)
    return { provider, key }
  }

  /** GET /api/market/providers — list providers + whether each is configured. */
  async providers({ response }: HttpContext) {
    const list = listProviders()
    const withStatus = await Promise.all(
      list.map(async (p) => ({ ...p, configured: p.requiresKey ? await isConfigured(p.id) : true }))
    )
    return response.ok(withStatus)
  }

  /** PUT /api/market/config — store a provider key in LOCAL config only. */
  async setConfig({ request, response }: HttpContext) {
    const { provider, key } = request.body() as { provider?: string; key?: string }
    if (!provider || !key) return response.badRequest({ error: 'provider and key are required' })
    if (!getProvider(provider)) return response.badRequest({ error: `Unknown provider: ${provider}` })
    await setKey(provider, key)
    return response.ok({ provider, configured: true }) // never echo the key
  }

  /** GET /api/market/:symbol/quote?provider= */
  async quote({ params, request, response }: HttpContext) {
    try {
      const { provider, key } = await this.#provider(request.input('provider'))
      const q = await cached(`q:${provider.id}:${params.symbol}`, () => provider.quote(params.symbol, key))
      return response.ok(q)
    } catch (err) {
      return response.badRequest({ error: (err as Error).message })
    }
  }

  /** GET /api/market/:symbol/history?provider=&from=&to= */
  async history({ params, request, response }: HttpContext) {
    try {
      const { provider, key } = await this.#provider(request.input('provider'))
      const from = request.input('from')
      const to = request.input('to')
      const points = await cached(`h:${provider.id}:${params.symbol}:${from ?? ''}:${to ?? ''}`, () =>
        provider.history(params.symbol, { from, to }, key)
      )
      return response.ok({ symbol: params.symbol, source: provider.id, points })
    } catch (err) {
      return response.badRequest({ error: (err as Error).message })
    }
  }

  /**
   * POST /api/models/:id/actuals/import-market — fetch a symbol's price history,
   * align to the timeline, write to the actuals store for `item`, advance
   * actualsThrough, stamping the source. Price-only (backtest-safe).
   */
  async importMarket({ params, request, response }: HttpContext) {
    const model = await modelStore().get(params.id)
    if (!model) return response.notFound({ error: 'Model not found' })
    const body = request.body() as { symbol?: string; item?: string }
    if (!body.symbol || !body.item) return response.badRequest({ error: 'symbol and item are required' })
    try {
      const { provider, key } = await this.#provider(request.input('provider'))
      const itemId = resolveItemId(model, body.item)
      const points = await cached(`h:${provider.id}:${body.symbol}::`, () =>
        provider.history(body.symbol!, {}, key)
      )
      const aligned = alignHistoryToTimeline(points, model.timeline)
      const source = `${provider.id}:${body.symbol}`
      const ingested = await actualsStore().putSeries(model.id, itemId, aligned, source)

      // Advance actualsThrough to the last observed period.
      let lastObserved = -1
      for (let i = 0; i < aligned.length; i++) if (aligned[i] !== null) lastObserved = i
      if (lastObserved > model.timeline.actualsThrough) {
        model.timeline.actualsThrough = lastObserved
        await modelStore().save(model, { override: true })
      }
      return response.ok({
        item: itemId,
        ingested,
        actualsThrough: model.timeline.actualsThrough,
        source,
        asOf: new Date().toISOString(),
      })
    } catch (err) {
      return response.badRequest({ error: (err as Error).message })
    }
  }

  /**
   * PUT /api/models/:id/drivers/:driverId/seed-from-quote — set a driver's value
   * from a symbol's current quote (v1: plain driver value). Records the source.
   */
  async seedFromQuote({ params, request, response }: HttpContext) {
    const model = await modelStore().get(params.id)
    if (!model) return response.notFound({ error: 'Model not found' })
    const body = request.body() as { symbol?: string }
    if (!body.symbol) return response.badRequest({ error: 'symbol is required' })
    try {
      const { provider, key } = await this.#provider(request.input('provider'))
      const q = await provider.quote(body.symbol, key)
      const result = setAssumption(model as Model, params.driverId, [q.price])
      if (!result.ok && request.input('override') !== 'true') {
        return response.unprocessableEntity({ ...result })
      }
      await modelStore().save(result.model, { override: true })
      return response.ok({ ...result, seeded: { symbol: body.symbol, price: q.price, source: q.source, asOf: q.asOf } })
    } catch (err) {
      return response.badRequest({ error: (err as Error).message })
    }
  }
}
