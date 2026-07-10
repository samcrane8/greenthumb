import type { HttpContext } from '@adonisjs/core/http'
import {
  createModel,
  computeModel,
  getStatement,
  getChartData,
  analyzeCapitalStack,
  compareScenarios,
  validateModel,
  listCommodities,
  findPriceModel,
  generatePrice,
  periodDate,
  TEMPLATES,
  type Granularity,
  type Model,
  type ModelType,
  type StatementKind,
  type Timeline,
} from '@greenthumb/core'

import { modelStore } from '#services/model_store'

/** Short axis label for a preview period, e.g. "Q3 '26" / "Jul '26" / "FY2028". */
function periodLabel(timeline: Timeline, index: number): string {
  const d = periodDate(timeline, index)
  const yy = String(d.getUTCFullYear()).slice(2)
  if (timeline.granularity === 'annual') return `FY${d.getUTCFullYear()}`
  if (timeline.granularity === 'quarterly') return `Q${Math.floor(d.getUTCMonth() / 3) + 1} '${yy}`
  return `${d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })} '${yy}`
}

/**
 * Model lifecycle + read/compute endpoints. The HTTP surface over the core
 * engine for the React UI (PRD §9.1). Mutating semantic operations live in
 * EditsController; here we handle create/read/replace/delete plus derived
 * views (compute, statements, validation).
 */
export default class ModelsController {
  /** GET /api/models — list model metadata. */
  async index({ response }: HttpContext) {
    return response.ok(await modelStore().list())
  }

  /** GET /api/templates — available starter templates. */
  async templates({ response }: HttpContext) {
    return response.ok(
      TEMPLATES.map((t) => ({ type: t.type, label: t.label, description: t.description }))
    )
  }

  /** GET /api/commodities — available commodities and their price models. */
  async commodities({ response }: HttpContext) {
    return response.ok(listCommodities())
  }

  /**
   * GET /api/commodities/:commodityId/:modelId/preview — a generated sample price
   * series over a default (or query-overridable) timeline, for the read-only
   * commodities view. Read-only; generates via the core registry. 404 if unknown.
   */
  async commodityPreview({ params, request, response }: HttpContext) {
    if (!findPriceModel(params.commodityId, params.modelId)) {
      return response.notFound({ error: 'Unknown commodity or price model' })
    }
    const now = new Date()
    const timeline: Timeline = {
      granularity: (request.input('granularity', 'quarterly') as Granularity),
      start: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`,
      periods: Math.max(1, Math.min(200, Number(request.input('periods', 24)))),
      fiscalYearStartMonth: 1,
      actualsThrough: -1,
    }

    // Collect param overrides: `band` is a string; the rest are numeric.
    const modelParams: Record<string, number | string> = {}
    const band = request.input('band')
    if (band) modelParams.band = String(band)
    for (const key of ['spot', 'amplitude', 'cycleYears', 'exponent', 'coefficient', 'damping']) {
      const v = request.input(key)
      if (v !== undefined && v !== null && v !== '') modelParams[key] = Number(v)
    }

    const series = generatePrice(params.commodityId, params.modelId, timeline, modelParams)
    const labels = series.map((_, i) => periodLabel(timeline, i))
    return response.ok({
      commodityId: params.commodityId,
      modelId: params.modelId,
      periods: timeline.periods,
      granularity: timeline.granularity,
      series,
      labels,
    })
  }

  /** POST /api/models — create from a template. */
  async store({ request, response }: HttpContext) {
    const body = request.body() as {
      name?: string
      type?: ModelType
      baseCurrency?: string
      timeline?: Model['timeline']
    }
    if (!body.name) return response.badRequest({ error: 'name is required' })

    const model = createModel({
      name: body.name,
      type: body.type,
      baseCurrency: body.baseCurrency,
      timeline: body.timeline,
    })
    const { issues, saved } = await modelStore().save(model)
    if (!saved) return response.unprocessableEntity({ error: 'Model failed validation', issues })
    return response.created({ model, issues })
  }

  /** GET /api/models/:id — full model graph. */
  async show({ params, response }: HttpContext) {
    const model = await modelStore().get(params.id)
    if (!model) return response.notFound({ error: 'Model not found' })
    return response.ok(model)
  }

  /** PUT /api/models/:id — replace the whole model (validate-on-write). */
  async update({ params, request, response }: HttpContext) {
    const existing = await modelStore().get(params.id)
    if (!existing) return response.notFound({ error: 'Model not found' })

    const incoming = request.body() as Model
    incoming.id = params.id // ids are immutable
    const override = request.input('override') === 'true'
    const { issues, saved } = await modelStore().save(incoming, { override })
    if (!saved) return response.unprocessableEntity({ error: 'Model failed validation', issues })
    return response.ok({ model: incoming, issues })
  }

  /** DELETE /api/models/:id */
  async destroy({ params, response }: HttpContext) {
    const deleted = await modelStore().delete(params.id)
    if (!deleted) return response.notFound({ error: 'Model not found' })
    return response.noContent()
  }

  /** GET /api/models/:id/validate — structured integrity issues. */
  async validate({ params, response }: HttpContext) {
    const model = await modelStore().get(params.id)
    if (!model) return response.notFound({ error: 'Model not found' })
    return response.ok({ issues: validateModel(model) })
  }

  /** GET /api/models/:id/compute?scenario=:scenarioId — computed series. */
  async compute({ params, request, response }: HttpContext) {
    const model = await modelStore().get(params.id)
    if (!model) return response.notFound({ error: 'Model not found' })
    const scenario = this.#resolveScenario(model, request.input('scenario'))
    if (!scenario) return response.badRequest({ error: 'Unknown scenario' })
    return response.ok(computeModel(model, scenario))
  }

  /** GET /api/models/:id/statement?kind=income&scenario=:id */
  async statement({ params, request, response }: HttpContext) {
    const model = await modelStore().get(params.id)
    if (!model) return response.notFound({ error: 'Model not found' })
    const scenario = this.#resolveScenario(model, request.input('scenario'))
    if (!scenario) return response.badRequest({ error: 'Unknown scenario' })
    const kind = (request.input('kind', 'income') as StatementKind)
    return response.ok(getStatement(model, scenario, kind))
  }

  /** GET /api/models/:id/charts/:chartId/data?scenario=:id — derived chart series. */
  async chartData({ params, request, response }: HttpContext) {
    const model = await modelStore().get(params.id)
    if (!model) return response.notFound({ error: 'Model not found' })
    const scenario = this.#resolveScenario(model, request.input('scenario'))
    if (!scenario) return response.badRequest({ error: 'Unknown scenario' })
    try {
      return response.ok(getChartData(model, scenario, params.chartId))
    } catch (err) {
      return response.notFound({ error: (err as Error).message })
    }
  }

  /** GET /api/models/:id/capital-stack/analysis?scenario=:id — seniority waterfall. */
  async capitalStackAnalysis({ params, request, response }: HttpContext) {
    const model = await modelStore().get(params.id)
    if (!model) return response.notFound({ error: 'Model not found' })
    const scenario = this.#resolveScenario(model, request.input('scenario'))
    if (!scenario) return response.badRequest({ error: 'Unknown scenario' })
    try {
      return response.ok(analyzeCapitalStack(model, scenario))
    } catch (err) {
      return response.badRequest({ error: (err as Error).message })
    }
  }

  /** GET /api/models/:id/compare?item=:itemId&scenarios=a,b,c */
  async compare({ params, request, response }: HttpContext) {
    const model = await modelStore().get(params.id)
    if (!model) return response.notFound({ error: 'Model not found' })
    const itemId = request.input('item')
    const scenarioIds = String(request.input('scenarios', ''))
      .split(',')
      .filter(Boolean)
    if (!itemId) return response.badRequest({ error: 'item is required' })
    return response.ok(compareScenarios(model, itemId, scenarioIds))
  }

  /** POST /api/models/:id/snapshot — named version checkpoint. */
  async snapshot({ params, request, response }: HttpContext) {
    const label = request.input('label', 'snapshot')
    const ok = await modelStore().snapshot(params.id, label)
    if (!ok) return response.notFound({ error: 'Model not found' })
    return response.ok({ snapshotted: true, label })
  }

  #resolveScenario(model: Model, scenarioId?: string) {
    if (!scenarioId) return model.scenarios[0]
    return model.scenarios.find((s) => s.id === scenarioId)
  }
}
