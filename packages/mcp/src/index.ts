#!/usr/bin/env node
/**
 * greenthumb MCP server (PRD §8).
 *
 * The machine interface that makes Claude a first-class collaborator on models.
 * It is a thin adapter over the *running local API* — so every write flows
 * through the same core engine the UI uses, the model stays the single source
 * of truth, and the UI updates live. Tools speak in semantic objects (models,
 * items, drivers, scenarios), never cell coordinates, and every mutating tool
 * supports `preview` for the accept/reject review flow.
 *
 * Configure in a Claude Desktop / MCP client:
 *   command: "node", args: ["<repo>/packages/mcp/dist/index.js"]
 *   env: { GREENTHUMB_API_URL: "http://localhost:3333", GREENTHUMB_API_KEY: "..." }
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const API_URL = process.env.GREENTHUMB_API_URL ?? 'http://localhost:3333'
const API_KEY = process.env.GREENTHUMB_API_KEY

async function call(
  path: string,
  init: { method?: string; body?: unknown; query?: Record<string, string | undefined> } = {}
): Promise<unknown> {
  const url = new URL(`${API_URL}/api${path}`)
  for (const [k, v] of Object.entries(init.query ?? {})) if (v !== undefined) url.searchParams.set(k, v)
  const res = await fetch(url, {
    method: init.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(API_KEY ? { authorization: `Bearer ${API_KEY}` } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
  const text = await res.text()
  const json = text ? JSON.parse(text) : null
  if (!res.ok) {
    throw new Error(
      `API ${res.status}: ${json?.error ?? res.statusText}${
        json?.issues ? ` — ${JSON.stringify(json.issues)}` : ''
      }`
    )
  }
  return json
}

/** Wrap a JSON result as MCP text content plus a short human summary. */
function result(summary: string, data: unknown) {
  return {
    content: [
      { type: 'text' as const, text: summary },
      { type: 'text' as const, text: JSON.stringify(data, null, 2) },
    ],
  }
}

function fail(err: unknown) {
  return {
    isError: true,
    content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
  }
}

/** Render an edit result's change summary as a short human phrase, if present. */
function changeText(data: unknown): string {
  const change = (data as { change?: { op?: string; entity?: string; name?: string; detail?: string } })?.change
  if (!change) return ''
  const parts = [change.op, change.entity, change.name].filter(Boolean).join(' ')
  return ` (${parts}${change.detail ? ` — ${change.detail}` : ''})`
}

const server = new McpServer(
  { name: 'greenthumb', version: '0.1.0' },
  {
    instructions: [
      'greenthumb is a financial modeling engine. You build and edit models as semantic',
      'graphs (drivers → time-aware formulas → outputs → scenarios), never cell coordinates.',
      '',
      'CRITICAL — a model that validates is not the same as a model that WORKS. Passing',
      '`validate_model` only proves arithmetic integrity (it balances, no dangling refs). It',
      'says NOTHING about whether the forecast is any good. After you build or change a model,',
      'you MUST test it against reality before trusting or presenting it:',
      '',
      '  1. import_actuals — load observed history for the key output items (revenue, NAV/share,',
      '     etc.). Without actuals there is no way to know if the model is right.',
      '  2. run_backtest (with splitAt) — score the forecast vs actuals; read the HOLDOUT metrics,',
      '     never the in-sample fit. Watch `bias`: a non-zero bias means the model systematically',
      '     over/under-forecasts — a structural problem, not noise.',
      '  3. walk_forward — the strongest test: many independent out-of-sample verdicts. Use it to',
      '     decide whether the model actually predicts, or just fits a story.',
      '  4. tornado — find the few drivers that actually move the answer before tuning anything.',
      '  5. calibrate — fit those drivers to history; it returns a CANDIDATE only. Apply it with',
      '     set_assumption (preview), then re-run run_backtest / walk_forward on the HOLDOUT. The',
      '     change is a real improvement ONLY if out-of-sample error falls — never optimize to the',
      '     in-sample fit. If `structuralFixLikely` is set, fix the model structure, not the inputs.',
      '',
      'The loop: build → validate → import_actuals → backtest/walk_forward → tornado → calibrate →',
      'apply → re-backtest. Report the out-of-sample accuracy (MAE/RMSE/MAPE + bias) whenever you',
      'present a model, so the user knows whether it works — not just that it balances.',
    ].join('\n'),
  }
)

// --- Discovery / read ------------------------------------------------------

server.registerTool(
  'list_models',
  { title: 'List models', description: 'List all models with their metadata.', inputSchema: {} },
  async () => {
    try {
      const models = (await call('/models')) as Array<{ id: string; name: string; type: string }>
      return result(`${models.length} model(s).`, models)
    } catch (err) {
      return fail(err)
    }
  }
)

server.registerTool(
  'list_templates',
  { title: 'List templates', description: 'List available model templates.', inputSchema: {} },
  async () => {
    try {
      return result('Available templates.', await call('/templates'))
    } catch (err) {
      return fail(err)
    }
  }
)

server.registerTool(
  'get_model',
  {
    title: 'Get model',
    description: 'Fetch a full model graph (timeline, items, drivers, scenarios).',
    inputSchema: { modelId: z.string() },
  },
  async ({ modelId }) => {
    try {
      return result(`Model ${modelId}.`, await call(`/models/${modelId}`))
    } catch (err) {
      return fail(err)
    }
  }
)

server.registerTool(
  'get_output',
  {
    title: 'Get output / statement',
    description:
      'Get a computed statement (income, balance_sheet, cash_flow, kpi) for a scenario as structured data.',
    inputSchema: {
      modelId: z.string(),
      kind: z.enum(['income', 'balance_sheet', 'cash_flow', 'kpi']).default('income'),
      scenarioId: z.string().optional(),
    },
  },
  async ({ modelId, kind, scenarioId }) => {
    try {
      const data = await call(`/models/${modelId}/statement`, { query: { kind, scenario: scenarioId } })
      return result(`${kind} statement for model ${modelId}.`, data)
    } catch (err) {
      return fail(err)
    }
  }
)

server.registerTool(
  'validate_model',
  {
    title: 'Validate model',
    description:
      'Run integrity checks (balance, dangling refs, formula syntax) and return issues. NOTE: validation only proves arithmetic integrity — it does NOT prove the forecast is correct. To know if the model actually works, import_actuals then run_backtest / walk_forward.',
    inputSchema: { modelId: z.string() },
  },
  async ({ modelId }) => {
    try {
      const data = (await call(`/models/${modelId}/validate`)) as { issues: unknown[] }
      const clean = data.issues.length === 0
      const summary = clean
        ? '0 issues — the model is arithmetically sound, but that does NOT mean the forecast is right. Next: import_actuals, then run_backtest (check holdout + bias) to test it against reality.'
        : `${data.issues.length} issue(s).`
      return result(summary, data)
    } catch (err) {
      return fail(err)
    }
  }
)

server.registerTool(
  'compare_scenarios',
  {
    title: 'Compare scenarios',
    description: 'Compare one output item across several scenarios.',
    inputSchema: { modelId: z.string(), itemId: z.string(), scenarioIds: z.array(z.string()) },
  },
  async ({ modelId, itemId, scenarioIds }) => {
    try {
      const data = await call(`/models/${modelId}/compare`, {
        query: { item: itemId, scenarios: scenarioIds.join(',') },
      })
      return result(`Comparison of ${itemId} across ${scenarioIds.length} scenario(s).`, data)
    } catch (err) {
      return fail(err)
    }
  }
)

// --- Lifecycle -------------------------------------------------------------

server.registerTool(
  'create_model',
  {
    title: 'Create model',
    description:
      'Scaffold a new model from a template (blank, saas, bitcoin_treasury, …). Optionally choose the timeline granularity, period count, and START DATE up front — set `start` to the real first-period date (e.g. "2020-07-01") so period labels reflect actual history rather than the default. For ticker-aware templates (e.g. bitcoin_treasury) set `ticker` to the company being modeled (e.g. "MSTR") — it names the price/market-cap items and labels the charts; defaults to a neutral "CO".',
    inputSchema: {
      name: z.string(),
      type: z.string().default('blank'),
      granularity: z.enum(['monthly', 'quarterly', 'annual']).optional(),
      periods: z.number().int().positive().optional(),
      start: z.string().optional().describe('ISO date of the first period, e.g. "2020-07-01".'),
      ticker: z
        .string()
        .optional()
        .describe('Company ticker for ticker-aware templates (e.g. "MSTR"). Defaults to "CO".'),
    },
  },
  async ({ name, type, granularity, periods, start, ticker }) => {
    try {
      const timeline =
        granularity || periods || start
          ? {
              ...(granularity ? { granularity } : {}),
              ...(periods ? { periods } : {}),
              ...(start ? { start } : {}),
            }
          : undefined
      const data = await call('/models', { method: 'POST', body: { name, type, timeline, ticker } })
      return result(`Created model "${name}".`, data)
    } catch (err) {
      return fail(err)
    }
  }
)

// --- Structure editing (all support preview) -------------------------------

const previewArg = {
  preview: z.boolean().default(false),
  // Mutating tools return a lean change summary by default (to keep iterative
  // editing light). Set full:true to get the entire model graph back instead.
  full: z
    .boolean()
    .default(false)
    .describe('Return the full model graph instead of the lean change summary.'),
}

server.registerTool(
  'add_line_item',
  {
    title: 'Add line item',
    description: 'Add a typed line item (input or formula). Set preview=true to dry-run.',
    inputSchema: {
      modelId: z.string(),
      name: z.string(),
      category: z.enum([
        'revenue',
        'cogs',
        'opex',
        'headcount',
        'asset',
        'liability',
        'equity',
        'cashflow',
        'kpi',
        'other',
      ]),
      unit: z.enum(['currency', 'percent', 'count', 'ratio', 'per_unit', 'none']),
      expression: z.string().describe('Formula expression, e.g. "revenue * gross_margin".'),
      section: z.string().optional(),
      scale: z
        .number()
        .optional()
        .describe('Display magnitude for currency, e.g. 1000000 when values are in $millions. Presentation only.'),
      ...previewArg,
    },
  },
  async ({ modelId, name, category, unit, expression, section, scale, preview, full }) => {
    try {
      const data = await call(`/models/${modelId}/items`, {
        method: 'POST',
        query: { preview: String(preview), summary: String(!full) },
        body: { name, category, unit, section, scale, definition: { kind: 'formula', expression } },
      })
      return result(preview ? `Preview: add "${name}".` : `Added "${name}".`, data)
    } catch (err) {
      return fail(err)
    }
  }
)

server.registerTool(
  'set_formula',
  {
    title: 'Set formula',
    description: "Set a line item's formula expression. Set preview=true to dry-run.",
    inputSchema: { modelId: z.string(), itemId: z.string(), expression: z.string(), ...previewArg },
  },
  async ({ modelId, itemId, expression, preview, full }) => {
    try {
      const data = await call(`/models/${modelId}/items/${itemId}/formula`, {
        method: 'PUT',
        query: { preview: String(preview), summary: String(!full) },
        body: { expression },
      })
      return result(preview ? 'Preview: set formula.' : 'Formula set.', data)
    } catch (err) {
      return fail(err)
    }
  }
)

server.registerTool(
  'add_driver',
  {
    title: 'Add driver',
    description: 'Add a driver/assumption (scalar/series/step/ramp).',
    inputSchema: {
      modelId: z.string(),
      name: z.string(),
      unit: z.enum(['currency', 'percent', 'count', 'ratio', 'per_unit', 'none']),
      shape: z.enum(['scalar', 'series', 'step', 'ramp']).default('scalar'),
      values: z.array(z.number()),
      ...previewArg,
    },
  },
  async ({ modelId, name, unit, shape, values, preview, full }) => {
    try {
      const data = await call(`/models/${modelId}/drivers`, {
        method: 'POST',
        query: { preview: String(preview), summary: String(!full) },
        body: { name, unit, shape, values },
      })
      return result(preview ? `Preview: add driver "${name}".` : `Added driver "${name}".`, data)
    } catch (err) {
      return fail(err)
    }
  }
)

server.registerTool(
  'set_assumption',
  {
    title: 'Set assumption',
    description: "Set a driver's base values. Set preview=true to dry-run.",
    inputSchema: { modelId: z.string(), driverId: z.string(), values: z.array(z.number()), ...previewArg },
  },
  async ({ modelId, driverId, values, preview, full }) => {
    try {
      const data = await call(`/models/${modelId}/drivers/${driverId}/assumption`, {
        method: 'PUT',
        query: { preview: String(preview), summary: String(!full) },
        body: { values },
      })
      return result(preview ? 'Preview: set assumption.' : 'Assumption set.', data)
    } catch (err) {
      return fail(err)
    }
  }
)

// --- Scenarios & timeline --------------------------------------------------

server.registerTool(
  'create_scenario',
  {
    title: 'Create scenario',
    description: 'Create a new scenario (driver overlay).',
    inputSchema: { modelId: z.string(), name: z.string() },
  },
  async ({ modelId, name }) => {
    try {
      return result(`Created scenario "${name}".`, await call(`/models/${modelId}/scenarios`, {
        method: 'POST',
        body: { name },
      }))
    } catch (err) {
      return fail(err)
    }
  }
)

server.registerTool(
  'set_scenario_value',
  {
    title: 'Set scenario value',
    description: "Override a driver's values within a scenario (null clears a period).",
    inputSchema: {
      modelId: z.string(),
      scenarioId: z.string(),
      driverId: z.string(),
      values: z.array(z.number().nullable()),
      ...previewArg,
    },
  },
  async ({ modelId, scenarioId, driverId, values, preview, full }) => {
    try {
      const data = await call(`/models/${modelId}/scenarios/${scenarioId}/value`, {
        method: 'PUT',
        query: { preview: String(preview), summary: String(!full) },
        body: { driverId, values },
      })
      return result(preview ? 'Preview: scenario override.' : 'Scenario override set.', data)
    } catch (err) {
      return fail(err)
    }
  }
)

server.registerTool(
  'extend_periods',
  {
    title: 'Extend periods',
    description: 'Extend the timeline horizon by N periods.',
    inputSchema: { modelId: z.string(), periods: z.number().int().positive(), ...previewArg },
  },
  async ({ modelId, periods, preview, full }) => {
    try {
      const data = await call(`/models/${modelId}/extend`, {
        method: 'POST',
        query: { preview: String(preview), summary: String(!full) },
        body: { periods },
      })
      return result(preview ? `Preview: extend by ${periods}.` : `Extended by ${periods}.`, data)
    } catch (err) {
      return fail(err)
    }
  }
)

// --- Charts ----------------------------------------------------------------

const chartSeriesSchema = z.object({
  ref: z.string().describe('Item or driver name to plot.'),
  label: z.string().optional(),
  axis: z.enum(['left', 'right']).optional(),
  style: z.enum(['line', 'bar', 'area']).optional(),
  index: z.boolean().optional().describe('Rebase to 100 at the first period.'),
})

server.registerTool(
  'list_charts',
  {
    title: 'List charts',
    description: "List a model's persisted chart definitions.",
    inputSchema: { modelId: z.string() },
  },
  async ({ modelId }) => {
    try {
      const model = (await call(`/models/${modelId}`)) as { charts?: unknown[] }
      const charts = model.charts ?? []
      return result(`${charts.length} chart(s).`, charts)
    } catch (err) {
      return fail(err)
    }
  }
)

server.registerTool(
  'add_chart',
  {
    title: 'Add chart',
    description:
      'Add a chart definition (line/area/bar/composed) plotting item/driver series by name. Set preview=true to dry-run.',
    inputSchema: {
      modelId: z.string(),
      title: z.string(),
      kind: z.enum(['line', 'area', 'bar', 'composed']).default('line'),
      series: z.array(chartSeriesSchema).min(1),
      scenarioId: z.string().optional(),
      ...previewArg,
    },
  },
  async ({ modelId, title, kind, series, scenarioId, preview, full }) => {
    try {
      const data = await call(`/models/${modelId}/charts`, {
        method: 'POST',
        query: { preview: String(preview), summary: String(!full) },
        body: { title, kind, series, scenarioId },
      })
      return result(preview ? `Preview: add chart "${title}".` : `Added chart "${title}".`, data)
    } catch (err) {
      return fail(err)
    }
  }
)

server.registerTool(
  'update_chart',
  {
    title: 'Update chart',
    description: 'Update a chart definition (title, kind, series). Set preview=true to dry-run.',
    inputSchema: {
      modelId: z.string(),
      chartId: z.string(),
      title: z.string().optional(),
      kind: z.enum(['line', 'area', 'bar', 'composed']).optional(),
      series: z.array(chartSeriesSchema).optional(),
      ...previewArg,
    },
  },
  async ({ modelId, chartId, title, kind, series, preview, full }) => {
    try {
      const patch: Record<string, unknown> = {}
      if (title !== undefined) patch.title = title
      if (kind !== undefined) patch.kind = kind
      if (series !== undefined) patch.series = series
      const data = await call(`/models/${modelId}/charts/${chartId}`, {
        method: 'PATCH',
        query: { preview: String(preview), summary: String(!full) },
        body: patch,
      })
      return result(preview ? 'Preview: update chart.' : 'Chart updated.', data)
    } catch (err) {
      return fail(err)
    }
  }
)

server.registerTool(
  'remove_chart',
  {
    title: 'Remove chart',
    description: 'Remove a chart (and any dashboard widgets that referenced it).',
    inputSchema: { modelId: z.string(), chartId: z.string(), ...previewArg },
  },
  async ({ modelId, chartId, preview, full }) => {
    try {
      const data = await call(`/models/${modelId}/charts/${chartId}`, {
        method: 'DELETE',
        query: { preview: String(preview), summary: String(!full) },
      })
      return result(preview ? 'Preview: remove chart.' : 'Chart removed.', data)
    } catch (err) {
      return fail(err)
    }
  }
)

server.registerTool(
  'get_chart_data',
  {
    title: 'Get chart data',
    description: "Compute a chart's referenced series for a scenario (chart-ready rows).",
    inputSchema: { modelId: z.string(), chartId: z.string(), scenarioId: z.string().optional() },
  },
  async ({ modelId, chartId, scenarioId }) => {
    try {
      const data = await call(`/models/${modelId}/charts/${chartId}/data`, {
        query: { scenario: scenarioId },
      })
      return result(`Chart data for ${chartId}.`, data)
    } catch (err) {
      return fail(err)
    }
  }
)

// --- Dashboard -------------------------------------------------------------

const widgetLayoutSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  w: z.number().int().positive(),
  h: z.number().int().positive(),
})

server.registerTool(
  'add_widget',
  {
    title: 'Add dashboard widget',
    description:
      'Add a dashboard widget. kind "chart" -> chart id, "stat" -> item name, "statement" -> statement kind, "note" -> text.',
    inputSchema: {
      modelId: z.string(),
      kind: z.enum(['chart', 'stat', 'statement', 'note']),
      refId: z.string().optional(),
      text: z.string().optional(),
      title: z.string().optional(),
      layout: widgetLayoutSchema,
      ...previewArg,
    },
  },
  async ({ modelId, kind, refId, text, title, layout, preview, full }) => {
    try {
      const data = await call(`/models/${modelId}/dashboard/widgets`, {
        method: 'POST',
        query: { preview: String(preview), summary: String(!full) },
        body: { kind, refId, text, title, layout },
      })
      return result(preview ? `Preview: add ${kind} widget.` : `Added ${kind} widget.`, data)
    } catch (err) {
      return fail(err)
    }
  }
)

server.registerTool(
  'update_widget',
  {
    title: 'Update dashboard widget',
    description: 'Update a widget (layout, refId, text, title). Set preview=true to dry-run.',
    inputSchema: {
      modelId: z.string(),
      widgetId: z.string(),
      refId: z.string().optional(),
      text: z.string().optional(),
      title: z.string().optional(),
      layout: widgetLayoutSchema.optional(),
      ...previewArg,
    },
  },
  async ({ modelId, widgetId, refId, text, title, layout, preview, full }) => {
    try {
      const patch: Record<string, unknown> = {}
      if (refId !== undefined) patch.refId = refId
      if (text !== undefined) patch.text = text
      if (title !== undefined) patch.title = title
      if (layout !== undefined) patch.layout = layout
      const data = await call(`/models/${modelId}/dashboard/widgets/${widgetId}`, {
        method: 'PATCH',
        query: { preview: String(preview), summary: String(!full) },
        body: patch,
      })
      return result(preview ? 'Preview: update widget.' : 'Widget updated.', data)
    } catch (err) {
      return fail(err)
    }
  }
)

server.registerTool(
  'remove_widget',
  {
    title: 'Remove dashboard widget',
    description: 'Remove a dashboard widget by id.',
    inputSchema: { modelId: z.string(), widgetId: z.string(), ...previewArg },
  },
  async ({ modelId, widgetId, preview, full }) => {
    try {
      const data = await call(`/models/${modelId}/dashboard/widgets/${widgetId}`, {
        method: 'DELETE',
        query: { preview: String(preview), summary: String(!full) },
      })
      return result(preview ? 'Preview: remove widget.' : 'Widget removed.', data)
    } catch (err) {
      return fail(err)
    }
  }
)

server.registerTool(
  'reorder_dashboard',
  {
    title: 'Reorder dashboard',
    description: 'Reorder dashboard widgets. Pass every existing widget id exactly once in the new order.',
    inputSchema: { modelId: z.string(), order: z.array(z.string()), ...previewArg },
  },
  async ({ modelId, order, preview, full }) => {
    try {
      const data = await call(`/models/${modelId}/dashboard/order`, {
        method: 'PUT',
        query: { preview: String(preview), summary: String(!full) },
        body: { order },
      })
      return result(preview ? 'Preview: reorder dashboard.' : 'Dashboard reordered.', data)
    } catch (err) {
      return fail(err)
    }
  }
)

// --- Timeline / rename / notes / delete ------------------------------------

server.registerTool(
  'set_timeline',
  {
    title: 'Set timeline',
    description:
      "Set a model's period count (up or down — trim allowed), granularity, and/or START DATE. Setting `start` (ISO date, e.g. \"2020-07-01\") re-anchors period labels to real history and regenerates commodity-bound drivers. Non-destructive: shrinking then re-growing restores prior values.",
    inputSchema: {
      modelId: z.string(),
      periods: z.number().int().positive().optional(),
      granularity: z.enum(['monthly', 'quarterly', 'annual']).optional(),
      start: z.string().optional().describe('ISO date of the first period, e.g. "2020-07-01".'),
      ...previewArg,
    },
  },
  async ({ modelId, periods, granularity, start, preview, full }) => {
    try {
      const data = await call(`/models/${modelId}/timeline`, {
        method: 'PUT',
        query: { preview: String(preview), summary: String(!full) },
        body: { periods, granularity, start },
      })
      return result(preview ? 'Preview: set timeline.' : `Timeline set${changeText(data)}.`, data)
    } catch (err) {
      return fail(err)
    }
  }
)

server.registerTool(
  'rename_driver',
  {
    title: 'Rename driver',
    description: 'Rename a driver; referencing formulas are rewritten in lockstep. Set preview=true to dry-run.',
    inputSchema: { modelId: z.string(), driverId: z.string(), name: z.string(), ...previewArg },
  },
  async ({ modelId, driverId, name, preview, full }) => {
    try {
      const data = await call(`/models/${modelId}/drivers/${driverId}/name`, {
        method: 'PUT',
        query: { preview: String(preview), summary: String(!full) },
        body: { name },
      })
      return result(preview ? 'Preview: rename driver.' : `Driver renamed${changeText(data)}.`, data)
    } catch (err) {
      return fail(err)
    }
  }
)

server.registerTool(
  'rename_item',
  {
    title: 'Rename line item',
    description: 'Rename a line item; referencing formulas are rewritten in lockstep. Set preview=true to dry-run.',
    inputSchema: { modelId: z.string(), itemId: z.string(), name: z.string(), ...previewArg },
  },
  async ({ modelId, itemId, name, preview, full }) => {
    try {
      const data = await call(`/models/${modelId}/items/${itemId}/name`, {
        method: 'PUT',
        query: { preview: String(preview), summary: String(!full) },
        body: { name },
      })
      return result(preview ? 'Preview: rename item.' : `Item renamed${changeText(data)}.`, data)
    } catch (err) {
      return fail(err)
    }
  }
)

server.registerTool(
  'rename_scenario',
  {
    title: 'Rename scenario',
    description: 'Rename a scenario. Set preview=true to dry-run.',
    inputSchema: { modelId: z.string(), scenarioId: z.string(), name: z.string(), ...previewArg },
  },
  async ({ modelId, scenarioId, name, preview, full }) => {
    try {
      const data = await call(`/models/${modelId}/scenarios/${scenarioId}/name`, {
        method: 'PUT',
        query: { preview: String(preview), summary: String(!full) },
        body: { name },
      })
      return result(preview ? 'Preview: rename scenario.' : `Scenario renamed${changeText(data)}.`, data)
    } catch (err) {
      return fail(err)
    }
  }
)

server.registerTool(
  'set_notes',
  {
    title: 'Set notes',
    description: "Set a driver's or line item's notes/annotation. Set preview=true to dry-run.",
    inputSchema: {
      modelId: z.string(),
      entityKind: z.enum(['driver', 'item']),
      entityId: z.string(),
      notes: z.string(),
      ...previewArg,
    },
  },
  async ({ modelId, entityKind, entityId, notes, preview, full }) => {
    try {
      const path =
        entityKind === 'driver'
          ? `/models/${modelId}/drivers/${entityId}/notes`
          : `/models/${modelId}/items/${entityId}/notes`
      const data = await call(path, { method: 'PUT', query: { preview: String(preview), summary: String(!full) }, body: { notes } })
      return result(preview ? 'Preview: set notes.' : `Notes set${changeText(data)}.`, data)
    } catch (err) {
      return fail(err)
    }
  }
)

server.registerTool(
  'remove_driver',
  {
    title: 'Remove driver',
    description:
      'Remove a driver (and strip it from scenario overrides). Fails if a formula still references it, unless override=true.',
    inputSchema: { modelId: z.string(), driverId: z.string(), ...previewArg },
  },
  async ({ modelId, driverId, preview, full }) => {
    try {
      const data = await call(`/models/${modelId}/drivers/${driverId}`, {
        method: 'DELETE',
        query: { preview: String(preview), summary: String(!full) },
      })
      return result(preview ? 'Preview: remove driver.' : `Driver removed${changeText(data)}.`, data)
    } catch (err) {
      return fail(err)
    }
  }
)

server.registerTool(
  'remove_scenario',
  {
    title: 'Remove scenario',
    description: 'Remove a scenario. Refuses to remove the last remaining scenario.',
    inputSchema: { modelId: z.string(), scenarioId: z.string(), ...previewArg },
  },
  async ({ modelId, scenarioId, preview, full }) => {
    try {
      const data = await call(`/models/${modelId}/scenarios/${scenarioId}`, {
        method: 'DELETE',
        query: { preview: String(preview), summary: String(!full) },
      })
      return result(preview ? 'Preview: remove scenario.' : `Scenario removed${changeText(data)}.`, data)
    } catch (err) {
      return fail(err)
    }
  }
)

server.registerTool(
  'delete_model',
  {
    title: 'Delete model',
    description: 'Delete an entire model. This cannot be undone.',
    inputSchema: { modelId: z.string() },
  },
  async ({ modelId }) => {
    try {
      await call(`/models/${modelId}`, { method: 'DELETE' })
      return result(`Deleted model ${modelId}.`, { deleted: modelId })
    } catch (err) {
      return fail(err)
    }
  }
)

// --- Commodities -----------------------------------------------------------

server.registerTool(
  'list_commodities',
  {
    title: 'List commodities',
    description: 'List available commodities and their price models (e.g. bitcoin / power law).',
    inputSchema: {},
  },
  async () => {
    try {
      return result('Available commodities.', await call('/commodities'))
    } catch (err) {
      return fail(err)
    }
  }
)

server.registerTool(
  'set_commodity_price',
  {
    title: 'Set commodity price',
    description:
      "Bind a driver to a commodity price model and generate its series (e.g. Bitcoin power law). params override model defaults, e.g. { spot: 62850, band: 'fair' }. Set preview=true to dry-run.",
    inputSchema: {
      modelId: z.string(),
      driverId: z.string(),
      commodity: z.string(),
      model: z.string(),
      params: z.record(z.union([z.number(), z.string()])).default({}),
      ...previewArg,
    },
  },
  async ({ modelId, driverId, commodity, model, params, preview, full }) => {
    try {
      const data = await call(`/models/${modelId}/drivers/${driverId}/commodity`, {
        method: 'PUT',
        query: { preview: String(preview), summary: String(!full) },
        body: { commodity, model, params },
      })
      return result(
        preview ? `Preview: price by ${commodity}/${model}.` : `Priced by ${commodity}/${model}${changeText(data)}.`,
        data
      )
    } catch (err) {
      return fail(err)
    }
  }
)

server.registerTool(
  'regenerate_commodity_price',
  {
    title: 'Regenerate commodity price',
    description: "Regenerate a bound driver's price series from its stored model over the current timeline.",
    inputSchema: { modelId: z.string(), driverId: z.string(), ...previewArg },
  },
  async ({ modelId, driverId, preview, full }) => {
    try {
      const data = await call(`/models/${modelId}/drivers/${driverId}/regenerate`, {
        method: 'POST',
        query: { preview: String(preview), summary: String(!full) },
      })
      return result(preview ? 'Preview: regenerate price.' : `Price regenerated${changeText(data)}.`, data)
    } catch (err) {
      return fail(err)
    }
  }
)

server.registerTool(
  'set_scenario_commodity_price',
  {
    title: 'Set scenario commodity price',
    description:
      "Set a scenario's commodity price assumptions for a driver, so that scenario computes its own price path. Editing the base scenario moves the model's baseline; an alternate scenario is a localized what-if. params override the model defaults (e.g. { spot, band, amplitude }).",
    inputSchema: {
      modelId: z.string(),
      scenarioId: z.string(),
      driverId: z.string(),
      commodity: z.string(),
      model: z.string(),
      params: z.record(z.union([z.number(), z.string()])).default({}),
      ...previewArg,
    },
  },
  async ({ modelId, scenarioId, driverId, commodity, model, params, preview, full }) => {
    try {
      const data = await call(`/models/${modelId}/scenarios/${scenarioId}/drivers/${driverId}/commodity`, {
        method: 'PUT',
        query: { preview: String(preview), summary: String(!full) },
        body: { commodity, model, params },
      })
      return result(
        preview
          ? `Preview: scenario priced by ${commodity}/${model}.`
          : `Scenario priced by ${commodity}/${model}${changeText(data)}.`,
        data
      )
    } catch (err) {
      return fail(err)
    }
  }
)

// --- Analysis: backtesting & model-improvement loop (handbook §3–4) ---------
//
// The empirical loop. These tools give the "how good is the model?" signal that
// structural editing alone can't: score forecast vs actuals, find what moves the
// answer (tornado), backtest and walk-forward against held-out history, and
// calibrate drivers to reality. IMPORTANT: the out-of-sample result is the
// referee — never optimize to the in-sample fit. Calibrate returns a candidate
// only; apply it with set_assumption (preview) and re-backtest the holdout.

server.registerTool(
  'import_actuals',
  {
    title: 'Import actuals',
    description:
      'Ingest observed historical values for an item (the fuel for backtesting). Provide a full values[] series aligned to the timeline (null = unobserved), or a single (period, value). Re-ingesting a period replaces it.',
    inputSchema: {
      modelId: z.string(),
      item: z.string().describe('Item id or name.'),
      values: z.array(z.number().nullable()).optional(),
      period: z.number().int().optional(),
      value: z.number().optional(),
      source: z.string().optional(),
    },
  },
  async ({ modelId, item, values, period, value, source }) => {
    try {
      const data = await call(`/models/${modelId}/actuals`, {
        method: 'POST',
        body: { item, values, period, value, source },
      })
      return result(`Ingested actuals for ${item}.`, data)
    } catch (err) {
      return fail(err)
    }
  }
)

server.registerTool(
  'score_forecast',
  {
    title: 'Score forecast vs actuals',
    description:
      'Score an item’s forecast against its stored actuals. Returns the full metric set together — MAE, RMSE, MAPE, bias (mean signed error), and the scored-period count — because one number hides the failure mode. A non-zero bias means a systematic over/under-forecast.',
    inputSchema: {
      modelId: z.string(),
      item: z.string(),
      scenario: z.string().optional(),
    },
  },
  async ({ modelId, item, scenario }) => {
    try {
      const data = await call(`/models/${modelId}/score`, { query: { item, scenario } })
      return result(`Scored ${item} against actuals.`, data)
    } catch (err) {
      return fail(err)
    }
  }
)

server.registerTool(
  'tornado',
  {
    title: 'Tornado sensitivity',
    description:
      'Rank drivers by how much they move a target output (perturb each ±deltaPct one-at-a-time). Use this FIRST to find the few dominant drivers before designing scenarios or calibrating — most drivers barely matter.',
    inputSchema: {
      modelId: z.string(),
      item: z.string().describe('Output item id or name to measure.'),
      atPeriod: z.number().int().optional().describe('Period to measure the swing at (default: last).'),
      deltaPct: z.number().optional().describe('Fractional perturbation, e.g. 0.1 for ±10% (default 0.1).'),
      scenario: z.string().optional(),
    },
  },
  async ({ modelId, item, atPeriod, deltaPct, scenario }) => {
    try {
      const data = await call(`/models/${modelId}/tornado`, {
        query: {
          item,
          scenario,
          atPeriod: atPeriod !== undefined ? String(atPeriod) : undefined,
          deltaPct: deltaPct !== undefined ? String(deltaPct) : undefined,
        },
      })
      return result(`Tornado ranking for ${item}.`, data)
    } catch (err) {
      return fail(err)
    }
  }
)

server.registerTool(
  'run_backtest',
  {
    title: 'Backtest forecast vs actuals',
    description:
      'Backtest an item’s forecast against stored actuals. With splitAt, reports in-sample vs out-of-sample (holdout) separately — only the HOLDOUT score is evidence of quality; never judge on the in-sample fit you tuned. Errors if the item has no actuals.',
    inputSchema: {
      modelId: z.string(),
      item: z.string(),
      splitAt: z.number().int().optional().describe('In-sample [0,splitAt], holdout [splitAt+1,coverage].'),
      scenario: z.string().optional(),
    },
  },
  async ({ modelId, item, splitAt, scenario }) => {
    try {
      const data = await call(`/models/${modelId}/backtest`, {
        query: { item, scenario, splitAt: splitAt !== undefined ? String(splitAt) : undefined },
      })
      return result(`Backtested ${item}.`, data)
    } catch (err) {
      return fail(err)
    }
  }
)

server.registerTool(
  'walk_forward',
  {
    title: 'Walk-forward validation',
    description:
      'The gold standard: roll a point-in-time cutover across history, re-forecasting from each cutoff and scoring the next unseen window. Produces many independent OUT-OF-SAMPLE verdicts — this is the referee for whether a model change is a real improvement. Refuses to run on look-ahead (future-referencing) formulas.',
    inputSchema: {
      modelId: z.string(),
      item: z.string(),
      window: z.enum(['anchored', 'rolling']).optional().describe('anchored=fixed start; rolling=fixed length slides.'),
      step: z.number().int().optional(),
      start: z.number().int().optional(),
      windowLen: z.number().int().optional(),
      scenario: z.string().optional(),
    },
  },
  async ({ modelId, item, window, step, start, windowLen, scenario }) => {
    try {
      const data = await call(`/models/${modelId}/walkforward`, {
        query: {
          item,
          window,
          scenario,
          step: step !== undefined ? String(step) : undefined,
          start: start !== undefined ? String(start) : undefined,
          windowLen: windowLen !== undefined ? String(windowLen) : undefined,
        },
      })
      return result(`Walk-forward for ${item}.`, data)
    } catch (err) {
      return fail(err)
    }
  }
)

server.registerTool(
  'calibrate',
  {
    title: 'Calibrate drivers to actuals',
    description:
      'Fit drivers to historical actuals over an in-sample window (bounded search). Returns a CANDIDATE only — it never commits. Apply the best-fit value with set_assumption (preview), then re-run run_backtest/walk_forward on the HOLDOUT: the change is a real improvement only if out-of-sample error falls. Reads the ranked residuals as a to-do list of likely structural fixes; if structuralFixLikely is true, fix the model’s structure, not the inputs.',
    inputSchema: {
      modelId: z.string(),
      item: z.string().describe('Target output item to fit against actuals.'),
      drivers: z.array(z.string()).describe('Driver ids or names to fit.'),
      metric: z.enum(['mae', 'rmse', 'mape']).optional(),
      window: z.object({ from: z.number().int(), to: z.number().int() }).optional(),
      bounds: z.record(z.object({ min: z.number(), max: z.number() })).optional(),
      acceptable: z.number().optional().describe('Metric threshold; above it, flags a structural fix.'),
      scenario: z.string().optional(),
    },
  },
  async ({ modelId, item, drivers, metric, window, bounds, acceptable, scenario }) => {
    try {
      const data = await call(`/models/${modelId}/calibrate`, {
        method: 'POST',
        body: { item, drivers, metric, window, bounds, acceptable, scenario },
      })
      return result(`Calibration candidate for ${item} (not committed).`, data)
    } catch (err) {
      return fail(err)
    }
  }
)

server.registerTool(
  'replay_actuals',
  {
    title: 'Replay actuals into an item',
    description:
      "Replace an item's formula with an actuals-backed input series, so real observed history drives it (and everything downstream) instead of the model's engine. Use this to replay lumpy, discretionary history the formula can't reproduce (e.g. a treasury's actual BTC holdings / share count). The original formula is preserved — restore it with restore_item. When `values` is omitted, the item's stored actuals are used. Validates on write: if the replayed values break the balance sheet, the issue is surfaced.",
    inputSchema: {
      modelId: z.string(),
      itemId: z.string(),
      values: z.array(z.number().nullable()).optional().describe('Series to replay; omit to use the stored actuals.'),
      ...previewArg,
    },
  },
  async ({ modelId, itemId, values, preview, full }) => {
    try {
      const data = await call(`/models/${modelId}/items/${itemId}/replay`, {
        method: 'PUT',
        query: { preview: String(preview), summary: String(!full) },
        body: { values },
      })
      return result(preview ? 'Preview: replay actuals.' : `Replayed actuals into item${changeText(data)}.`, data)
    } catch (err) {
      return fail(err)
    }
  }
)

server.registerTool(
  'restore_item',
  {
    title: 'Restore a replayed item',
    description: "Restore an item that was replayed from actuals back to its original formula definition.",
    inputSchema: { modelId: z.string(), itemId: z.string(), ...previewArg },
  },
  async ({ modelId, itemId, preview, full }) => {
    try {
      const data = await call(`/models/${modelId}/items/${itemId}/restore`, {
        method: 'PUT',
        query: { preview: String(preview), summary: String(!full) },
      })
      return result(preview ? 'Preview: restore item.' : `Restored item definition${changeText(data)}.`, data)
    } catch (err) {
      return fail(err)
    }
  }
)

// --- Market data -----------------------------------------------------------

server.registerTool(
  'list_data_providers',
  {
    title: 'List data providers',
    description: 'List available market-data providers and whether each is configured (keyless default works with no key).',
    inputSchema: {},
  },
  async () => {
    try {
      return result('Available data providers.', await call('/market/providers'))
    } catch (err) {
      return fail(err)
    }
  }
)

server.registerTool(
  'get_quote',
  {
    title: 'Get quote',
    description: 'Fetch a current price quote for a symbol from a market-data provider.',
    inputSchema: { symbol: z.string(), provider: z.string().optional() },
  },
  async ({ symbol, provider }) => {
    try {
      return result(`Quote for ${symbol}.`, await call(`/market/${symbol}/quote`, { query: { provider } }))
    } catch (err) {
      return fail(err)
    }
  }
)

server.registerTool(
  'get_price_history',
  {
    title: 'Get price history',
    description: 'Fetch a symbol\'s daily price history from a provider (optionally bounded by from/to ISO dates).',
    inputSchema: {
      symbol: z.string(),
      provider: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    },
  },
  async ({ symbol, provider, from, to }) => {
    try {
      const data = await call(`/market/${symbol}/history`, { query: { provider, from, to } })
      return result(`Price history for ${symbol}.`, data)
    } catch (err) {
      return fail(err)
    }
  }
)

server.registerTool(
  'import_market_actuals',
  {
    title: 'Import market actuals',
    description:
      "Fetch a symbol's price history and materialize it into a model's actuals for an item (aligned to the timeline, advancing actualsThrough). Price-only — backtest-safe. Feeds scoring/backtesting.",
    inputSchema: {
      modelId: z.string(),
      symbol: z.string(),
      item: z.string().describe('Item name or id to import the price series into.'),
      provider: z.string().optional(),
    },
  },
  async ({ modelId, symbol, item, provider }) => {
    try {
      const data = await call(`/models/${modelId}/actuals/import-market`, {
        method: 'POST',
        query: { provider },
        body: { symbol, item },
      })
      return result(`Imported ${symbol} history into ${item}.`, data)
    } catch (err) {
      return fail(err)
    }
  }
)

server.registerTool(
  'seed_driver_from_quote',
  {
    title: 'Seed driver from quote',
    description: "Set a driver's value from a symbol's current quote (records the source). Recomputes the model.",
    inputSchema: { modelId: z.string(), driverId: z.string(), symbol: z.string(), provider: z.string().optional() },
  },
  async ({ modelId, driverId, symbol, provider }) => {
    try {
      const data = await call(`/models/${modelId}/drivers/${driverId}/seed-from-quote`, {
        method: 'PUT',
        query: { provider },
        body: { symbol },
      })
      return result(`Seeded driver from ${symbol}.`, data)
    } catch (err) {
      return fail(err)
    }
  }
)

// --- Capital stack ---------------------------------------------------------

const trancheKind = z.enum(['senior_debt', 'subordinated_debt', 'convertible', 'preferred', 'common'])

server.registerTool(
  'add_tranche',
  {
    title: 'Add capital-stack tranche',
    description:
      "Add a tranche to the model's capital stack. `notionalRef` names a model series for its claim; `rate`/`rateRef` for cost of capital; `sharesRef` for common; converts use `conversionPrice` + `convertAsEquity`.",
    inputSchema: {
      modelId: z.string(),
      name: z.string(),
      kind: trancheKind,
      seniority: z.number(),
      notionalRef: z.string().optional(),
      rate: z.number().optional(),
      rateRef: z.string().optional(),
      sharesRef: z.string().optional(),
      conversionPrice: z.number().optional(),
      convertAsEquity: z.number().optional(),
      ...previewArg,
    },
  },
  async ({ modelId, preview, ...body }) => {
    try {
      const data = await call(`/models/${modelId}/capital-stack/tranches`, {
        method: 'POST',
        query: { preview: String(preview) },
        body,
      })
      return result(preview ? `Preview: add tranche "${body.name}".` : `Added tranche "${body.name}"${changeText(data)}.`, data)
    } catch (err) {
      return fail(err)
    }
  }
)

server.registerTool(
  'update_tranche',
  {
    title: 'Update tranche',
    description: 'Update a tranche (seniority, refs, rate, convert terms). Set preview=true to dry-run.',
    inputSchema: {
      modelId: z.string(),
      trancheId: z.string(),
      name: z.string().optional(),
      kind: trancheKind.optional(),
      seniority: z.number().optional(),
      notionalRef: z.string().optional(),
      rate: z.number().optional(),
      rateRef: z.string().optional(),
      sharesRef: z.string().optional(),
      conversionPrice: z.number().optional(),
      convertAsEquity: z.number().optional(),
      ...previewArg,
    },
  },
  async ({ modelId, trancheId, preview, ...patch }) => {
    try {
      const data = await call(`/models/${modelId}/capital-stack/tranches/${trancheId}`, {
        method: 'PATCH',
        query: { preview: String(preview) },
        body: patch,
      })
      return result(preview ? 'Preview: update tranche.' : `Tranche updated${changeText(data)}.`, data)
    } catch (err) {
      return fail(err)
    }
  }
)

server.registerTool(
  'remove_tranche',
  {
    title: 'Remove tranche',
    description: 'Remove a tranche from the capital stack.',
    inputSchema: { modelId: z.string(), trancheId: z.string(), ...previewArg },
  },
  async ({ modelId, trancheId, preview }) => {
    try {
      const data = await call(`/models/${modelId}/capital-stack/tranches/${trancheId}`, {
        method: 'DELETE',
        query: { preview: String(preview) },
      })
      return result(preview ? 'Preview: remove tranche.' : `Tranche removed${changeText(data)}.`, data)
    } catch (err) {
      return fail(err)
    }
  }
)

server.registerTool(
  'set_capital_stack_assets',
  {
    title: 'Set capital-stack assets',
    description: "Set the asset series (by name) the stack's claims are paid from.",
    inputSchema: { modelId: z.string(), assetRefs: z.array(z.string()), ...previewArg },
  },
  async ({ modelId, assetRefs, preview }) => {
    try {
      const data = await call(`/models/${modelId}/capital-stack/assets`, {
        method: 'PUT',
        query: { preview: String(preview) },
        body: { assetRefs },
      })
      return result(preview ? 'Preview: set assets.' : `Capital-stack assets set${changeText(data)}.`, data)
    } catch (err) {
      return fail(err)
    }
  }
)

server.registerTool(
  'get_capital_stack_analysis',
  {
    title: 'Get capital-stack analysis',
    description:
      'Compute the seniority waterfall for a scenario: per-tranche claim/paid/recovery/coverage, residual-to-common, NAV/share, blended cost of capital, implied leverage, and diluted shares.',
    inputSchema: { modelId: z.string(), scenarioId: z.string().optional() },
  },
  async ({ modelId, scenarioId }) => {
    try {
      const data = await call(`/models/${modelId}/capital-stack/analysis`, { query: { scenario: scenarioId } })
      return result('Capital-stack waterfall analysis.', data)
    } catch (err) {
      return fail(err)
    }
  }
)

const transport = new StdioServerTransport()
await server.connect(transport)
// Never log to stdout — it corrupts the stdio JSON-RPC channel. Use stderr.
console.error('greenthumb MCP server running on stdio; API:', API_URL)
