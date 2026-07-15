import type {
  Chart,
  ChartData,
  ComputedModel,
  Model,
  ModelMeta,
  ModelType,
  Statement,
  StatementKind,
  Tranche,
  ValidationIssue,
  Widget,
} from '@greenthumb/core'

/** Mirror of core's CapitalStackAnalysis (web imports types only). */
export type CapitalStackAnalysis = {
  scenarioId: string
  periods: number
  assetValue: number[]
  tranches: Array<{
    id: string
    name: string
    kind: Tranche['kind']
    seniority: number
    claim: number[]
    paid: number[]
    recovery: number[]
    claimsAhead: number[]
    coverage: number[]
  }>
  residualToCommon: number[]
  navPerShare: number[]
  dilutedShares: number[]
  blendedCost: number[]
  impliedLeverage: number[]
}

import { resolveTarget } from './apiTarget'
import { getSettings } from '@/settings/store'

/**
 * Typed client for the AdonisJS API. Requests go to /api — same-origin in dev
 * (Vite proxy), Electron, and cloud — unless the user has connected to a hosted
 * instance in Settings, in which case the effective base URL + key are resolved
 * from the settings store at call time. The response shapes reuse
 * @greenthumb/core's types, so the UI, API, and engine all speak one vocabulary.
 */

const ENV_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? ''
const ENV_KEY = import.meta.env.VITE_API_KEY as string | undefined

/** Effective API origin + bearer key: cloud connection wins, else build-time env. */
function target() {
  return resolveTarget(getSettings().cloud, { base: ENV_BASE, key: ENV_KEY })
}

export type ServerInfo = { mode: 'local' | 'cloud'; requiresApiKey: boolean; version: string }
export type ModelListItem = ModelMeta & { id: string }
export type TemplateInfo = { type: ModelType; label: string; description: string }
export type PriceModelInfo = {
  id: string
  label: string
  defaultParams: Record<string, number | string>
}
export type CommodityInfo = { id: string; label: string; models: PriceModelInfo[] }
export type CommodityPreview = {
  commodityId: string
  modelId: string
  periods: number
  granularity: string
  series: number[]
  labels: string[]
}
export type EditResult = { model: Model; issues: ValidationIssue[]; ok: boolean }

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const { base, key } = target()
  const res = await fetch(`${base}/api${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(key ? { authorization: `Bearer ${key}` } : {}),
      ...init?.headers,
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body?.error ?? res.statusText, body?.issues)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

/**
 * Probe a specific instance's posture without going through the effective
 * target — used to validate a cloud connection before it is saved. Throws
 * ApiError on an unreachable host or a rejected key.
 */
export async function probeInfo(url: string, key?: string): Promise<ServerInfo> {
  const base = url.trim().replace(/\/+$/, '')
  const res = await fetch(`${base}/api/info`, {
    headers: { ...(key ? { authorization: `Bearer ${key}` } : {}) },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body?.error ?? res.statusText)
  }
  return res.json() as Promise<ServerInfo>
}

export class ApiError extends Error {
  status: number
  issues?: ValidationIssue[]
  constructor(status: number, message: string, issues?: ValidationIssue[]) {
    super(message)
    this.status = status
    this.issues = issues
  }
}

export const api = {
  info: () => req<ServerInfo>('/info'),
  listModels: () => req<ModelListItem[]>('/models'),
  templates: () => req<TemplateInfo[]>('/templates'),
  commodities: () => req<CommodityInfo[]>('/commodities'),

  // --- Capital stack -------------------------------------------------------
  capitalStackAnalysis: (id: string, scenario?: string) =>
    req<CapitalStackAnalysis>(
      `/models/${id}/capital-stack/analysis${scenario ? `?scenario=${scenario}` : ''}`
    ),
  addTranche: (id: string, tranche: Omit<Tranche, 'id'>) =>
    req<EditResult>(`/models/${id}/capital-stack/tranches`, {
      method: 'POST',
      body: JSON.stringify(tranche),
    }),
  updateTranche: (id: string, trancheId: string, patch: Partial<Omit<Tranche, 'id'>>) =>
    req<EditResult>(`/models/${id}/capital-stack/tranches/${trancheId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  removeTranche: (id: string, trancheId: string) =>
    req<EditResult>(`/models/${id}/capital-stack/tranches/${trancheId}`, { method: 'DELETE' }),
  setCapitalStackAssets: (id: string, assetRefs: string[]) =>
    req<EditResult>(`/models/${id}/capital-stack/assets`, {
      method: 'PUT',
      body: JSON.stringify({ assetRefs }),
    }),

  // --- Market data ---------------------------------------------------------
  dataProviders: () =>
    req<Array<{ id: string; label: string; requiresKey: boolean; configured: boolean }>>('/market/providers'),
  setProviderKey: (provider: string, key: string) =>
    req<{ provider: string; configured: boolean }>('/market/config', {
      method: 'PUT',
      body: JSON.stringify({ provider, key }),
    }),
  marketQuote: (symbol: string, provider?: string) =>
    req<{ symbol: string; price: number; source: string; asOf: string }>(
      `/market/${encodeURIComponent(symbol)}/quote${provider ? `?provider=${provider}` : ''}`
    ),
  importMarketActuals: (id: string, symbol: string, item: string, provider?: string) =>
    req<{ item: string; ingested: number; actualsThrough: number; source: string; asOf: string }>(
      `/models/${id}/actuals/import-market${provider ? `?provider=${provider}` : ''}`,
      { method: 'POST', body: JSON.stringify({ symbol, item }) }
    ),
  seedDriverFromQuote: (id: string, driverId: string, symbol: string, provider?: string) =>
    req<EditResult & { seeded: { symbol: string; price: number; source: string } }>(
      `/models/${id}/drivers/${driverId}/seed-from-quote${provider ? `?provider=${provider}` : ''}`,
      { method: 'PUT', body: JSON.stringify({ symbol }) }
    ),
  commodityPreview: (
    commodityId: string,
    modelId: string,
    params?: Record<string, number | string>
  ) => {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params ?? {})) qs.set(k, String(v))
    const q = qs.toString()
    return req<CommodityPreview>(
      `/commodities/${commodityId}/${modelId}/preview${q ? `?${q}` : ''}`
    )
  },
  createModel: (input: { name: string; type: ModelType; ticker?: string }) =>
    req<{ model: Model; issues: ValidationIssue[] }>('/models', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  getModel: (id: string) => req<Model>(`/models/${id}`),
  deleteModel: (id: string) => req<void>(`/models/${id}`, { method: 'DELETE' }),
  validate: (id: string) => req<{ issues: ValidationIssue[] }>(`/models/${id}/validate`),
  compute: (id: string, scenario?: string) =>
    req<ComputedModel>(`/models/${id}/compute${scenario ? `?scenario=${scenario}` : ''}`),
  statement: (id: string, kind: StatementKind, scenario?: string) =>
    req<Statement>(
      `/models/${id}/statement?kind=${kind}${scenario ? `&scenario=${scenario}` : ''}`
    ),
  setAssumption: (id: string, driverId: string, values: number[]) =>
    req<EditResult>(`/models/${id}/drivers/${driverId}/assumption`, {
      method: 'PUT',
      body: JSON.stringify({ values }),
    }),
  createScenario: (id: string, name: string) =>
    req<EditResult>(`/models/${id}/scenarios`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  extendPeriods: (id: string, periods: number) =>
    req<EditResult>(`/models/${id}/extend`, {
      method: 'POST',
      body: JSON.stringify({ periods }),
    }),
  snapshot: (id: string, label: string) =>
    req<{ snapshotted: boolean }>(`/models/${id}/snapshot`, {
      method: 'POST',
      body: JSON.stringify({ label }),
    }),

  // --- Charts & dashboard --------------------------------------------------
  chartData: (id: string, chartId: string, scenario?: string) =>
    req<ChartData>(
      `/models/${id}/charts/${chartId}/data${scenario ? `?scenario=${scenario}` : ''}`
    ),
  addChart: (id: string, chart: Omit<Chart, 'id'>) =>
    req<EditResult>(`/models/${id}/charts`, { method: 'POST', body: JSON.stringify(chart) }),
  updateChart: (id: string, chartId: string, patch: Partial<Omit<Chart, 'id'>>) =>
    req<EditResult>(`/models/${id}/charts/${chartId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  removeChart: (id: string, chartId: string) =>
    req<EditResult>(`/models/${id}/charts/${chartId}`, { method: 'DELETE' }),
  addWidget: (id: string, widget: Omit<Widget, 'id'>) =>
    req<EditResult>(`/models/${id}/dashboard/widgets`, {
      method: 'POST',
      body: JSON.stringify(widget),
    }),
  setScenarioCommodityPrice: (
    id: string,
    scenarioId: string,
    driverId: string,
    binding: { commodity: string; model: string; params: Record<string, number | string> }
  ) =>
    req<EditResult>(`/models/${id}/scenarios/${scenarioId}/drivers/${driverId}/commodity`, {
      method: 'PUT',
      body: JSON.stringify(binding),
    }),
  updateWidget: (id: string, widgetId: string, patch: Partial<Omit<Widget, 'id'>>) =>
    req<EditResult>(`/models/${id}/dashboard/widgets/${widgetId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  removeWidget: (id: string, widgetId: string) =>
    req<EditResult>(`/models/${id}/dashboard/widgets/${widgetId}`, { method: 'DELETE' }),
  reorderDashboard: (id: string, order: string[]) =>
    req<EditResult>(`/models/${id}/dashboard/order`, {
      method: 'PUT',
      body: JSON.stringify({ order }),
    }),
}
