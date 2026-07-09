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
    if (preview) {
      return ctx.response.ok({ ...result, previewed: true })
    }
    if (!result.ok && !override) {
      return ctx.response.unprocessableEntity({ ...result })
    }
    await modelStore().save(result.model, { override: true })
    return ctx.response.ok(result)
  }
}
