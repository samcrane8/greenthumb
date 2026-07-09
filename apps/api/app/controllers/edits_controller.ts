import type { HttpContext } from '@adonisjs/core/http'
import {
  addLineItem,
  updateLineItem,
  setFormula,
  removeItem,
  addDriver,
  setAssumption,
  createScenario,
  setScenarioValue,
  extendPeriods,
  addChart,
  updateChart,
  removeChart,
  addWidget,
  updateWidget,
  removeWidget,
  reorderDashboard,
  setPeriods,
  setGranularity,
  renameDriver,
  renameItem,
  renameScenario,
  updateNotes,
  removeDriver,
  removeScenario,
  setCommodityPrice,
  generateCommodityPrice,
  setScenarioCommodityPrice,
  type CommodityPriceBinding,
  type Granularity,
  type Model,
  type OpResult,
} from '@greenthumb/core'

import { modelStore } from '#services/model_store'

/**
 * Semantic edit operations (PRD §8). Each endpoint loads the model, applies one
 * core operation, and — because every core op validates-on-write — commits only
 * when the result is clean (or ?override=true). The response mirrors the MCP
 * contract: { model, issues, ok }, so the UI and Claude see identical results.
 *
 * Pass ?preview=true to get the candidate + issues WITHOUT persisting — this is
 * the accept/reject review flow (PRD §7.5).
 */
export default class EditsController {
  async addItem(ctx: HttpContext) {
    return this.#apply(ctx, (model) => addLineItem(model, ctx.request.body() as never))
  }

  async updateItem(ctx: HttpContext) {
    const { itemId } = ctx.params
    return this.#apply(ctx, (model) =>
      updateLineItem(model, itemId, ctx.request.body() as never)
    )
  }

  async setFormula(ctx: HttpContext) {
    const { itemId } = ctx.params
    const expression = ctx.request.input('expression', '')
    return this.#apply(ctx, (model) => setFormula(model, itemId, expression))
  }

  async removeItem(ctx: HttpContext) {
    const { itemId } = ctx.params
    return this.#apply(ctx, (model) => removeItem(model, itemId))
  }

  async addDriver(ctx: HttpContext) {
    return this.#apply(ctx, (model) => addDriver(model, ctx.request.body() as never))
  }

  async setAssumption(ctx: HttpContext) {
    const { driverId } = ctx.params
    const values = ctx.request.input('values', []) as number[]
    return this.#apply(ctx, (model) => setAssumption(model, driverId, values))
  }

  async createScenario(ctx: HttpContext) {
    const name = ctx.request.input('name', 'Scenario')
    return this.#apply(ctx, (model) => createScenario(model, name))
  }

  async setScenarioValue(ctx: HttpContext) {
    const { scenarioId } = ctx.params
    const driverId = ctx.request.input('driverId')
    const values = ctx.request.input('values', []) as (number | null)[]
    return this.#apply(ctx, (model) => setScenarioValue(model, scenarioId, driverId, values))
  }

  async extendPeriods(ctx: HttpContext) {
    const n = Number(ctx.request.input('periods', 0))
    return this.#apply(ctx, (model) => extendPeriods(model, n))
  }

  // --- Charts ---------------------------------------------------------------

  async addChart(ctx: HttpContext) {
    return this.#apply(ctx, (model) => addChart(model, ctx.request.body() as never))
  }

  async updateChart(ctx: HttpContext) {
    const { chartId } = ctx.params
    return this.#apply(ctx, (model) => updateChart(model, chartId, ctx.request.body() as never))
  }

  async removeChart(ctx: HttpContext) {
    const { chartId } = ctx.params
    return this.#apply(ctx, (model) => removeChart(model, chartId))
  }

  // --- Dashboard ------------------------------------------------------------

  async addWidget(ctx: HttpContext) {
    return this.#apply(ctx, (model) => addWidget(model, ctx.request.body() as never))
  }

  async updateWidget(ctx: HttpContext) {
    const { widgetId } = ctx.params
    return this.#apply(ctx, (model) => updateWidget(model, widgetId, ctx.request.body() as never))
  }

  async removeWidget(ctx: HttpContext) {
    const { widgetId } = ctx.params
    return this.#apply(ctx, (model) => removeWidget(model, widgetId))
  }

  async reorderDashboard(ctx: HttpContext) {
    const order = ctx.request.input('order', []) as string[]
    return this.#apply(ctx, (model) => reorderDashboard(model, order))
  }

  // --- Timeline -------------------------------------------------------------

  async setTimeline(ctx: HttpContext) {
    const periods = ctx.request.input('periods')
    const granularity = ctx.request.input('granularity') as Granularity | undefined
    return this.#apply(ctx, (model) => {
      let result: OpResult = { model, issues: [], ok: true }
      if (periods !== undefined && periods !== null) result = setPeriods(model, Number(periods))
      if (granularity) result = setGranularity(result.model, granularity)
      return result
    })
  }

  // --- Rename & notes -------------------------------------------------------

  async renameDriver(ctx: HttpContext) {
    const { driverId } = ctx.params
    const name = ctx.request.input('name', '')
    return this.#apply(ctx, (model) => renameDriver(model, driverId, name))
  }

  async renameItem(ctx: HttpContext) {
    const { itemId } = ctx.params
    const name = ctx.request.input('name', '')
    return this.#apply(ctx, (model) => renameItem(model, itemId, name))
  }

  async renameScenario(ctx: HttpContext) {
    const { scenarioId } = ctx.params
    const name = ctx.request.input('name', '')
    return this.#apply(ctx, (model) => renameScenario(model, scenarioId, name))
  }

  async setDriverNotes(ctx: HttpContext) {
    const { driverId } = ctx.params
    const notes = ctx.request.input('notes', '')
    return this.#apply(ctx, (model) => updateNotes(model, driverId, notes))
  }

  async setItemNotes(ctx: HttpContext) {
    const { itemId } = ctx.params
    const notes = ctx.request.input('notes', '')
    return this.#apply(ctx, (model) => updateNotes(model, itemId, notes))
  }

  // --- Deletion -------------------------------------------------------------

  async removeDriver(ctx: HttpContext) {
    const { driverId } = ctx.params
    return this.#apply(ctx, (model) => removeDriver(model, driverId))
  }

  async removeScenario(ctx: HttpContext) {
    const { scenarioId } = ctx.params
    return this.#apply(ctx, (model) => removeScenario(model, scenarioId))
  }

  // --- Commodity pricing ----------------------------------------------------

  async setCommodityPrice(ctx: HttpContext) {
    const { driverId } = ctx.params
    const body = ctx.request.body() as { commodity: string; model: string; params?: Record<string, number | string> }
    const binding: CommodityPriceBinding = {
      commodity: body.commodity,
      model: body.model,
      params: body.params ?? {},
    }
    return this.#apply(ctx, (model) => setCommodityPrice(model, driverId, binding))
  }

  async regenerateCommodityPrice(ctx: HttpContext) {
    const { driverId } = ctx.params
    return this.#apply(ctx, (model) => generateCommodityPrice(model, driverId))
  }

  async setScenarioCommodityPrice(ctx: HttpContext) {
    const { scenarioId, driverId } = ctx.params
    const body = ctx.request.body() as { commodity: string; model: string; params?: Record<string, number | string> }
    const binding: CommodityPriceBinding = {
      commodity: body.commodity,
      model: body.model,
      params: body.params ?? {},
    }
    return this.#apply(ctx, (model) => setScenarioCommodityPrice(model, scenarioId, driverId, binding))
  }

  /** Load → apply one op → validate → (persist unless preview) → respond. */
  async #apply(ctx: HttpContext, op: (model: Model) => OpResult) {
    const model = await modelStore().get(ctx.params.id)
    if (!model) return ctx.response.notFound({ error: 'Model not found' })

    let result: OpResult
    try {
      result = op(model)
    } catch (err) {
      return ctx.response.badRequest({ error: (err as Error).message })
    }

    const preview = ctx.request.input('preview') === 'true'
    const override = ctx.request.input('override') === 'true'
    const summaryOnly = ctx.request.input('summary') === 'true'

    // Lean response: return the change summary + issues without the full model.
    const shape = (r: OpResult, extra: Record<string, unknown> = {}) =>
      summaryOnly ? { change: r.change, issues: r.issues, ok: r.ok, ...extra } : { ...r, ...extra }

    if (preview) {
      return ctx.response.ok(shape(result, { previewed: true }))
    }
    if (!result.ok && !override) {
      return ctx.response.unprocessableEntity(shape(result))
    }
    await modelStore().save(result.model, { override: true })
    return ctx.response.ok(shape(result))
  }
}
