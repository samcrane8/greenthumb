import type { DataProvider, PricePoint, Quote, HistoryRange } from './provider.js'

/**
 * Yahoo Finance — a keyless provider backed by the public v8 chart API
 * (`query1.finance.yahoo.com/v8/finance/chart/<SYMBOL>`). It returns real quotes
 * and split/dividend-adjusted daily closes with no API key, so it is the
 * zero-config default. A browser `User-Agent` is required or Yahoo rejects the
 * request. Symbols pass through unchanged (Yahoo uses bare tickers like `MSTR`,
 * `^GSPC`), so no exchange-suffixing is needed.
 *
 * History uses `period1`/`period2` epoch params (NOT `range=max`): with a
 * `range`, Yahoo silently coerces long spans to a coarse granularity (e.g.
 * `range=max` → quarterly bars), whereas explicit periods with `interval=1d`
 * return true daily bars. `period1` defaults to 0 (earliest available) and
 * `period2` to now when the caller gives no `from`/`to`.
 *
 * The pure `parseQuote`/`parseHistory` helpers are exported so they can be unit
 * tested against a captured fixture without any network I/O.
 */

const BASE = 'https://query1.finance.yahoo.com/v8/finance/chart'
const UA = 'Mozilla/5.0'

/** Midnight-UTC epoch seconds for a YYYY-MM-DD date. */
function isoToEpoch(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 1000)
}

/** Minimal shape of the v8 chart payload we read. */
export interface YahooChart {
  chart?: {
    result?: Array<{
      meta?: { symbol?: string; regularMarketPrice?: number; regularMarketTime?: number }
      timestamp?: number[]
      indicators?: {
        adjclose?: Array<{ adjclose?: (number | null)[] }>
        quote?: Array<{ close?: (number | null)[] }>
      }
    }>
    error?: unknown
  }
}

async function fetchChart(symbol: string, query: string): Promise<YahooChart> {
  const url = `${BASE}/${encodeURIComponent(symbol)}?${query}`
  const res = await fetch(url, { headers: { 'User-Agent': UA, accept: 'application/json' } })
  if (!res.ok) throw new Error(`Yahoo request failed (${res.status})`)
  return (await res.json()) as YahooChart
}

/** Parse a current-snapshot quote from a chart payload. */
export function parseQuote(json: YahooChart, symbol: string): Quote {
  const meta = json.chart?.result?.[0]?.meta
  const price = Number(meta?.regularMarketPrice)
  if (!Number.isFinite(price)) throw new Error(`Yahoo: no quote for "${symbol}"`)
  const asOf =
    typeof meta?.regularMarketTime === 'number'
      ? new Date(meta.regularMarketTime * 1000).toISOString()
      : new Date().toISOString()
  return { symbol, price, source: 'yahoo', asOf }
}

/**
 * Parse adjusted daily closes from a chart payload, filtered to [from, to].
 * Prefers adjusted closes (backtest-safe); falls back to raw closes. Daily bars
 * are stamped at the exchange open (13:30/14:30 UTC for US equities), so a UTC
 * date is the trading date.
 */
export function parseHistory(json: YahooChart, symbol: string, range: HistoryRange): PricePoint[] {
  const result = json.chart?.result?.[0]
  const stamps = result?.timestamp ?? []
  const closes = result?.indicators?.adjclose?.[0]?.adjclose ?? result?.indicators?.quote?.[0]?.close ?? []
  const points: PricePoint[] = []
  for (let i = 0; i < stamps.length; i++) {
    const close = Number(closes[i])
    if (!Number.isFinite(close)) continue
    const date = new Date(stamps[i]! * 1000).toISOString().slice(0, 10)
    if (range.from && date < range.from) continue
    if (range.to && date > range.to) continue
    points.push({ date, close })
  }
  points.sort((a, b) => (a.date < b.date ? -1 : 1))
  if (points.length === 0) throw new Error(`Yahoo: no history for "${symbol}"`)
  return points
}

export const yahooProvider: DataProvider = {
  id: 'yahoo',
  label: 'Yahoo Finance (free)',
  requiresKey: false,

  async quote(symbol: string): Promise<Quote> {
    // A short range is enough — quote reads meta.regularMarketPrice, not the bars.
    return parseQuote(await fetchChart(symbol, 'interval=1d&range=5d'), symbol)
  },

  async history(symbol: string, range: HistoryRange): Promise<PricePoint[]> {
    // Explicit epoch periods keep daily granularity (range=max would coerce to
    // quarterly). parseHistory still applies the [from,to] filter as a backstop.
    const period1 = range.from ? isoToEpoch(range.from) : 0
    const period2 = range.to ? isoToEpoch(range.to) + 86_400 : Math.floor(Date.now() / 1000)
    const query = `interval=1d&period1=${period1}&period2=${period2}`
    return parseHistory(await fetchChart(symbol, query), symbol, range)
  },
}
