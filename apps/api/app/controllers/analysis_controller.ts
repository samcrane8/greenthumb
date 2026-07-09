import type { HttpContext } from '@adonisjs/core/http'
import {
  scoreForecast,
  sweepDriver,
  tornado,
  backtest,
  backtestSplit,
  walkForward,
  calibrate,
  resolveItemId,
  computeModel,
  type CalibrationMetric,
  type Model,
} from '@greenthumb/core'

import { modelStore } from '#services/model_store'
import { actualsStore } from '#services/actuals_store'

/**
 * Analysis + actuals endpoints — the backtesting / model-improvement loop
 * (handbook §3–4). Read-only analysis (score, sweep, tornado, backtest,
 * walk-forward) plus actuals ingestion and calibration. Every analysis is a thin
 * adapter over the core engine; actuals live in SQLite via ActualsStore.
 */
export default class AnalysisController {
  async #load(id: string): Promise<Model | null> {
    return modelStore().get(id)
  }

  /** GET /api/models/:id/score?item=&scenario= — forecast-vs-actual metric set. */
  async score({ params, request, response }: HttpContext) {
    const model = await this.#load(params.id)
    if (!model) return response.notFound({ error: 'Model not found' })
    const item = request.input('item')
    if (!item) return response.badRequest({ error: 'item is required' })
    try {
      const itemId = resolveItemId(model, item)
      const actuals = await actualsStore().series(model.id, itemId, model.timeline.periods)
      const metrics = scoreForecast(model, item, actuals, {
        scenarioId: request.input('scenario'),
      })
      return response.ok({ item: itemId, metrics })
    } catch (err) {
      return response.badRequest({ error: (err as Error).message })
    }
  }

  /** GET /api/models/:id/sweep?driver=&values=1,2,3&item=&scenario= */
  async sweep({ params, request, response }: HttpContext) {
    const model = await this.#load(params.id)
    if (!model) return response.notFound({ error: 'Model not found' })
    const driver = request.input('driver')
    const item = request.input('item')
    const values = String(request.input('values', ''))
      .split(',')
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v))
    if (!driver || !item || values.length === 0) {
      return response.badRequest({ error: 'driver, item, and values are required' })
    }
    try {
      return response.ok({ points: sweepDriver(model, driver, values, item, { scenarioId: request.input('scenario') }) })
    } catch (err) {
      return response.badRequest({ error: (err as Error).message })
    }
  }

  /** GET /api/models/:id/tornado?item=&atPeriod=&deltaPct=&scenario= */
  async tornado({ params, request, response }: HttpContext) {
    const model = await this.#load(params.id)
    if (!model) return response.notFound({ error: 'Model not found' })
    const item = request.input('item')
    if (!item) return response.badRequest({ error: 'item is required' })
    try {
      const atPeriod = request.input('atPeriod')
      const deltaPct = request.input('deltaPct')
      const rows = tornado(model, item, {
        scenarioId: request.input('scenario'),
        atPeriod: atPeriod !== undefined ? Number(atPeriod) : undefined,
        deltaPct: deltaPct !== undefined ? Number(deltaPct) : undefined,
      })
      return response.ok({ rows })
    } catch (err) {
      return response.badRequest({ error: (err as Error).message })
    }
  }

  /** GET /api/models/:id/backtest?item=&scenario=&splitAt= — basic or holdout split. */
  async backtest({ params, request, response }: HttpContext) {
    const model = await this.#load(params.id)
    if (!model) return response.notFound({ error: 'Model not found' })
    const item = request.input('item')
    if (!item) return response.badRequest({ error: 'item is required' })
    try {
      const itemId = resolveItemId(model, item)
      const actuals = await actualsStore().series(model.id, itemId, model.timeline.periods)
      const scenarioId = request.input('scenario')
      const splitAt = request.input('splitAt')
      if (splitAt !== undefined) {
        return response.ok(backtestSplit(model, item, actuals, Number(splitAt), { scenarioId }))
      }
      return response.ok(backtest(model, item, actuals, { scenarioId }))
    } catch (err) {
      return response.badRequest({ error: (err as Error).message })
    }
  }

  /** GET /api/models/:id/walkforward?item=&window=anchored|rolling&step=&start=&windowLen= */
  async walkforward({ params, request, response }: HttpContext) {
    const model = await this.#load(params.id)
    if (!model) return response.notFound({ error: 'Model not found' })
    const item = request.input('item')
    if (!item) return response.badRequest({ error: 'item is required' })
    try {
      const itemId = resolveItemId(model, item)
      const actuals = await actualsStore().series(model.id, itemId, model.timeline.periods)
      const num = (k: string) => (request.input(k) !== undefined ? Number(request.input(k)) : undefined)
      return response.ok(
        walkForward(model, item, actuals, {
          scenarioId: request.input('scenario'),
          window: request.input('window') as 'anchored' | 'rolling' | undefined,
          step: num('step'),
          start: num('start'),
          windowLen: num('windowLen'),
        })
      )
    } catch (err) {
      return response.badRequest({ error: (err as Error).message })
    }
  }

  /**
   * POST /api/models/:id/calibrate — fit drivers to actuals (candidate only).
   * Body: { item, drivers: string[], metric?, window?, bounds?, apply? }.
   * Never auto-commits; when `apply` names a driver, we return a previewed
   * assumption edit so the caller can accept/reject it (the preview/accept flow).
   */
  async calibrate({ params, request, response }: HttpContext) {
    const model = await this.#load(params.id)
    if (!model) return response.notFound({ error: 'Model not found' })
    const body = request.body() as {
      item?: string
      drivers?: string[]
      metric?: CalibrationMetric
      window?: { from: number; to: number }
      bounds?: Record<string, { min: number; max: number }>
      scenario?: string
      acceptable?: number
    }
    if (!body.item || !body.drivers?.length) {
      return response.badRequest({ error: 'item and drivers are required' })
    }
    try {
      const itemId = resolveItemId(model, body.item)
      const actuals = await actualsStore().series(model.id, itemId, model.timeline.periods)
      const result = calibrate(model, body.item, body.drivers, actuals, {
        metric: body.metric,
        window: body.window,
        bounds: body.bounds,
        scenarioId: body.scenario,
        acceptable: body.acceptable,
      })
      return response.ok({
        candidate: result,
        note: 'Candidate only — apply via the assumption preview/accept flow and re-backtest on the holdout before accepting.',
      })
    } catch (err) {
      return response.badRequest({ error: (err as Error).message })
    }
  }

  /** POST /api/models/:id/actuals — ingest observed values. Body: { item, values? , period?, value?, source? }. */
  async putActuals({ params, request, response }: HttpContext) {
    const model = await this.#load(params.id)
    if (!model) return response.notFound({ error: 'Model not found' })
    const body = request.body() as {
      item?: string
      values?: (number | null)[]
      period?: number
      value?: number
      source?: string
    }
    if (!body.item) return response.badRequest({ error: 'item is required' })
    try {
      const itemId = resolveItemId(model, body.item)
      const source = body.source ?? null
      let ingested = 0
      if (Array.isArray(body.values)) {
        ingested = await actualsStore().putSeries(model.id, itemId, body.values, source)
      } else if (body.period !== undefined && body.value !== undefined) {
        await actualsStore().put(model.id, itemId, body.period, body.value, source)
        ingested = 1
      } else {
        return response.badRequest({ error: 'provide values[] or (period, value)' })
      }
      return response.ok({ item: itemId, ingested })
    } catch (err) {
      return response.badRequest({ error: (err as Error).message })
    }
  }

  /**
   * POST /api/models/:id/actuals/import — CSV import with column→item mapping.
   * Body: { csv, mapping: { column: itemRef }, source? }. Rows map to periods by
   * order. Unmapped/unparsable columns are reported, not silently dropped.
   */
  async importCsv({ params, request, response }: HttpContext) {
    const model = await this.#load(params.id)
    if (!model) return response.notFound({ error: 'Model not found' })
    const body = request.body() as {
      csv?: string
      mapping?: Record<string, string>
      source?: string
    }
    if (!body.csv || !body.mapping) {
      return response.badRequest({ error: 'csv and mapping are required' })
    }
    const rows = body.csv
      .trim()
      .split(/\r?\n/)
      .map((line) => line.split(','))
    if (rows.length < 2) return response.badRequest({ error: 'csv needs a header and at least one row' })
    const header = rows[0]!.map((h) => h.trim())
    const dataRows = rows.slice(1)

    const ingested: Record<string, number> = {}
    const unmapped: string[] = []
    const errors: string[] = []

    for (let col = 0; col < header.length; col++) {
      const column = header[col]!
      const itemRef = body.mapping[column]
      if (!itemRef) {
        // Only report columns the caller didn't intend as a mapping target.
        if (!Object.values(body.mapping).includes(column)) unmapped.push(column)
        continue
      }
      let itemId: string
      try {
        itemId = resolveItemId(model, itemRef)
      } catch {
        errors.push(`mapping "${column}" → unknown item "${itemRef}"`)
        continue
      }
      const series: (number | null)[] = dataRows.map((r) => {
        const raw = r[col]?.trim()
        if (raw === undefined || raw === '') return null
        const v = Number(raw)
        return Number.isFinite(v) ? v : null
      })
      ingested[itemId] = await actualsStore().putSeries(model.id, itemId, series, body.source ?? `csv`)
    }

    return response.ok({ ingested, unmapped, errors })
  }

  /** GET /api/models/:id/forecast-actual?item=&scenario= — per-period join. */
  async forecastActual({ params, request, response }: HttpContext) {
    const model = await this.#load(params.id)
    if (!model) return response.notFound({ error: 'Model not found' })
    const item = request.input('item')
    if (!item) return response.badRequest({ error: 'item is required' })
    try {
      const itemId = resolveItemId(model, item)
      const actuals = await actualsStore().series(model.id, itemId, model.timeline.periods)
      // Read-only compute for the forecast side.
      const scenario =
        model.scenarios.find((s) => s.id === request.input('scenario')) ??
        model.scenarios.find((s) => s.name.toLowerCase() === 'base') ??
        model.scenarios[0]
      const forecast = computeModel(model, scenario!).series[itemId] ?? []
      const rows = actuals.map((a, p) => ({
        period: p,
        forecast: forecast[p] ?? null,
        actual: a,
        residual: a !== null && forecast[p] !== undefined ? forecast[p]! - a : null,
      }))
      return response.ok({ item: itemId, rows })
    } catch (err) {
      return response.badRequest({ error: (err as Error).message })
    }
  }
}
