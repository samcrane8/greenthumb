import type {
  Chart,
  ChartData,
  ComputedModel,
  Model,
  ModelMeta,
  ModelType,
  Statement,
  StatementKind,
  ValidationIssue,
  Widget,
} from '@greenthumb/core'

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
  createModel: (input: { name: string; type: ModelType }) =>
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
