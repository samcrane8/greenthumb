import type { DataProvider, PricePoint, Quote, HistoryRange } from './provider.js'

/**
 * FRED (Federal Reserve Bank of St. Louis) — a BYO-key macro/economic data
 * provider. Symbols are FRED **series IDs** (e.g. `M2SL` money supply, `WALCL`
 * Fed balance sheet, `FEDFUNDS` policy rate, `DTWEXBGS` broad USD index), so the
 * liquidity/rates/FX side of an analysis is sourceable in-tool as first-class
 * series that materialize like price data. The key is supplied by the config
 * layer, never stored in a model.
 *
 * Backtest caveat: macro series are **revised** over time (the value for a past
 * month changes as FRED revises). v1 imports latest-published observations — the
 * same simplification the price providers make — so a backtest over revised
 * series carries mild lookahead. Point-in-time vintages (ALFRED `realtime_start`)
 * are a deliberate later change.
 *
 * The pure `parseLatest` / `parseObservations` helpers are exported so they can be
 * unit tested against a captured fixture without any network I/O.
 */

const BASE = 'https://api.stlouisfed.org/fred/series/observations'

/** Minimal shape of the observations payload we read (plus FRED's error body). */
export interface FredObservations {
  observations?: Array<{ date?: string; value?: string }>
  error_code?: number
  error_message?: string
}

async function fetchObservations(
  symbol: string,
  key: string | undefined,
  extraParams: Record<string, string>,
): Promise<FredObservations> {
  if (!key) throw new Error('FRED requires an API key')
  const params = new URLSearchParams({
    series_id: symbol,
    api_key: key,
    file_type: 'json',
    ...extraParams,
  })
  const res = await fetch(`${BASE}?${params.toString()}`, { headers: { accept: 'application/json' } })
  const json = (await res.json().catch(() => ({}))) as FredObservations
  // FRED returns 400 + { error_code, error_message } for a bad key/series — surface it.
  if (!res.ok) throw new Error(json.error_message ?? `FRED request failed (${res.status})`)
  return json
}

/** Latest observation of a series as a quote. */
export function parseLatest(json: FredObservations, symbol: string): Quote {
  const obs = json.observations?.[0]
  const price = obs && obs.value !== '.' ? Number(obs.value) : NaN
  if (!Number.isFinite(price)) throw new Error(`FRED: no quote for "${symbol}"`)
  const asOf = obs?.date ? `${obs.date}T00:00:00Z` : new Date().toISOString()
  return { symbol, price, source: 'fred', asOf }
}

/** Observation series → dated points, missing (`"."`) values skipped, filtered to [from,to]. */
export function parseObservations(
  json: FredObservations,
  symbol: string,
  range: HistoryRange,
): PricePoint[] {
  const points: PricePoint[] = []
  for (const o of json.observations ?? []) {
    const date = o.date
    if (!date || o.value === '.' || o.value == null) continue
    const close = Number(o.value)
    if (!Number.isFinite(close)) continue
    if (range.from && date < range.from) continue
    if (range.to && date > range.to) continue
    points.push({ date, close })
  }
  points.sort((a, b) => (a.date < b.date ? -1 : 1))
  if (points.length === 0) throw new Error(`FRED: no history for "${symbol}"`)
  return points
}

export const fredProvider: DataProvider = {
  id: 'fred',
  label: 'FRED (macro/econ, API key)',
  requiresKey: true,

  async quote(symbol: string, key?: string): Promise<Quote> {
    return parseLatest(await fetchObservations(symbol, key, { sort_order: 'desc', limit: '1' }), symbol)
  },

  async history(symbol: string, range: HistoryRange, key?: string): Promise<PricePoint[]> {
    const extra: Record<string, string> = {}
    if (range.from) extra.observation_start = range.from
    if (range.to) extra.observation_end = range.to
    return parseObservations(await fetchObservations(symbol, key, extra), symbol, range)
  },
}
