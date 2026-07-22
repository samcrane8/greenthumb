import type { DataProvider, PricePoint, Quote, HistoryRange } from './provider.js'

/**
 * A keyless, network-free provider that returns deterministic synthetic prices.
 * Useful offline (demos, first-run, tests): a gently rising series with a per-
 * symbol seed so different tickers differ. Not real data — labelled as such.
 */
function seed(symbol: string): number {
  let h = 0
  for (const c of symbol.toUpperCase()) h = (h * 31 + c.charCodeAt(0)) % 997
  return 50 + (h % 200) // base price 50–250
}

export const demoProvider: DataProvider = {
  id: 'demo',
  label: 'Demo (synthetic, offline)',
  requiresKey: false,

  async quote(symbol: string): Promise<Quote> {
    const base = seed(symbol)
    return { symbol, price: Math.round(base * 3.5 * 100) / 100, source: 'demo', asOf: new Date().toISOString() }
  },

  async history(symbol: string, range: HistoryRange): Promise<PricePoint[]> {
    const base = seed(symbol)
    const start = new Date(range.from ? `${range.from}T00:00:00Z` : '2022-01-01T00:00:00Z')
    const end = new Date(range.to ? `${range.to}T00:00:00Z` : '2027-12-01T00:00:00Z')
    const points: PricePoint[] = []
    let i = 0
    const d = new Date(start)
    while (d <= end) {
      // gentle exponential drift + mild wave, deterministic
      const close = base * Math.pow(1.02, i / 12) * (1 + 0.08 * Math.sin(i / 6))
      points.push({ date: d.toISOString().slice(0, 10), close: Math.round(close * 100) / 100 })
      d.setUTCMonth(d.getUTCMonth() + 1)
      i++
    }
    return points
  },
}
