/**
 * Market-data provider layer (adapter-only; PRD §9.1 keeps core pure).
 *
 * A DataProvider fetches quotes and price history from an external source. The
 * registry mirrors how core registers TEMPLATES/COMMODITIES, but lives ENTIRELY
 * in the API so `packages/core` gains no I/O dependency. Nothing here is imported
 * by the engine; results are materialized into models by the controller.
 *
 * v1 scope (backtest-safe): price history + current-snapshot quotes only. No
 * point-in-time fundamentals — importing today's restated fundamentals into
 * historical actuals would be lookahead bias (see the change design).
 */

export interface Quote {
  symbol: string
  price: number
  source: string
  /** ISO timestamp the quote was observed/returned. */
  asOf: string
}

export interface PricePoint {
  /** ISO date (YYYY-MM-DD) of the close. */
  date: string
  close: number
}

export interface HistoryRange {
  from?: string
  to?: string
}

export interface DataProvider {
  id: string
  label: string
  requiresKey: boolean
  /** Current snapshot quote for a symbol. */
  quote(symbol: string, key?: string): Promise<Quote>
  /** Split/dividend-adjusted daily closes for a symbol over a range (ascending by date). */
  history(symbol: string, range: HistoryRange, key?: string): Promise<PricePoint[]>
}

const PROVIDERS = new Map<string, DataProvider>()

/** Register a provider. Also used by tests to install a deterministic stub. */
export function registerProvider(provider: DataProvider): void {
  PROVIDERS.set(provider.id, provider)
}

export function getProvider(id: string): DataProvider | undefined {
  return PROVIDERS.get(id)
}

/** List providers (id, label, whether a key is required) — never returns keys. */
export function listProviders(): Array<{ id: string; label: string; requiresKey: boolean }> {
  return [...PROVIDERS.values()].map((p) => ({ id: p.id, label: p.label, requiresKey: p.requiresKey }))
}

/** The default provider id (the keyless one, so the feature works zero-config). */
export const DEFAULT_PROVIDER = 'yahoo'

// ---------------------------------------------------------------------------
// A tiny in-memory TTL cache so repeated imports don't re-hit the network.
// (v1: process-local. SQLite-backed persistence is a deliberate later step.)
// ---------------------------------------------------------------------------

const cache = new Map<string, { at: number; value: unknown }>()
const TTL_MS = 15 * 60 * 1000 // 15 minutes

export async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T
  const value = await fn()
  cache.set(key, { at: Date.now(), value })
  return value
}

/** Test-only: clear the cache between cases. */
export function __clearCache(): void {
  cache.clear()
}
