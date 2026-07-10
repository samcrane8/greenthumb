import type { DataProvider, PricePoint, Quote, HistoryRange } from './provider.js'

/**
 * Alpha Vantage — a BYO-key provider (broader coverage than the keyless default).
 * The key is supplied by the config layer, never stored in a model. Uses adjusted
 * daily closes so history is backtest-safe.
 */
export const alphaVantageProvider: DataProvider = {
  id: 'alphavantage',
  label: 'Alpha Vantage (API key)',
  requiresKey: true,

  async quote(symbol: string, key?: string): Promise<Quote> {
    if (!key) throw new Error('Alpha Vantage requires an API key')
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(key)}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Alpha Vantage request failed (${res.status})`)
    const json = (await res.json()) as { 'Global Quote'?: Record<string, string> }
    const price = Number(json['Global Quote']?.['05. price'])
    if (!Number.isFinite(price)) throw new Error(`Alpha Vantage: no quote for "${symbol}"`)
    return { symbol, price, source: 'alphavantage', asOf: new Date().toISOString() }
  },

  async history(symbol: string, range: HistoryRange, key?: string): Promise<PricePoint[]> {
    if (!key) throw new Error('Alpha Vantage requires an API key')
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${encodeURIComponent(symbol)}&outputsize=full&apikey=${encodeURIComponent(key)}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Alpha Vantage request failed (${res.status})`)
    const json = (await res.json()) as { 'Time Series (Daily)'?: Record<string, Record<string, string>> }
    const series = json['Time Series (Daily)']
    if (!series) throw new Error(`Alpha Vantage: no history for "${symbol}"`)
    const points: PricePoint[] = []
    for (const [date, row] of Object.entries(series)) {
      if (range.from && date < range.from) continue
      if (range.to && date > range.to) continue
      const close = Number(row['5. adjusted close'] ?? row['4. close'])
      if (Number.isFinite(close)) points.push({ date, close })
    }
    points.sort((a, b) => (a.date < b.date ? -1 : 1))
    if (points.length === 0) throw new Error(`Alpha Vantage: no history for "${symbol}"`)
    return points
  },
}
