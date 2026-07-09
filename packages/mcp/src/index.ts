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

const server = new McpServer({ name: 'greenthumb', version: '0.1.0' })

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
    description: 'Run integrity checks (balance, dangling refs, formula syntax) and return issues.',
    inputSchema: { modelId: z.string() },
  },
  async ({ modelId }) => {
    try {
      const data = (await call(`/models/${modelId}/validate`)) as { issues: unknown[] }
      return result(`${data.issues.length} issue(s).`, data)
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
    description: 'Scaffold a new model from a template (blank, saas, …).',
    inputSchema: { name: z.string(), type: z.string().default('blank') },
  },
  async ({ name, type }) => {
    try {
      const data = await call('/models', { method: 'POST', body: { name, type } })
      return result(`Created model "${name}".`, data)
    } catch (err) {
      return fail(err)
    }
  }
)

// --- Structure editing (all support preview) -------------------------------

const previewArg = { preview: z.boolean().default(false) }

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
      ...previewArg,
    },
  },
  async ({ modelId, name, category, unit, expression, section, preview }) => {
    try {
      const data = await call(`/models/${modelId}/items`, {
        method: 'POST',
        query: { preview: String(preview) },
        body: { name, category, unit, section, definition: { kind: 'formula', expression } },
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
  async ({ modelId, itemId, expression, preview }) => {
    try {
      const data = await call(`/models/${modelId}/items/${itemId}/formula`, {
        method: 'PUT',
        query: { preview: String(preview) },
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
  async ({ modelId, name, unit, shape, values, preview }) => {
    try {
      const data = await call(`/models/${modelId}/drivers`, {
        method: 'POST',
        query: { preview: String(preview) },
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
  async ({ modelId, driverId, values, preview }) => {
    try {
      const data = await call(`/models/${modelId}/drivers/${driverId}/assumption`, {
        method: 'PUT',
        query: { preview: String(preview) },
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
  async ({ modelId, scenarioId, driverId, values, preview }) => {
    try {
      const data = await call(`/models/${modelId}/scenarios/${scenarioId}/value`, {
        method: 'PUT',
        query: { preview: String(preview) },
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
  async ({ modelId, periods, preview }) => {
    try {
      const data = await call(`/models/${modelId}/extend`, {
        method: 'POST',
        query: { preview: String(preview) },
        body: { periods },
      })
      return result(preview ? `Preview: extend by ${periods}.` : `Extended by ${periods}.`, data)
    } catch (err) {
      return fail(err)
    }
  }
)

const transport = new StdioServerTransport()
await server.connect(transport)
// Never log to stdout — it corrupts the stdio JSON-RPC channel. Use stderr.
console.error('greenthumb MCP server running on stdio; API:', API_URL)
