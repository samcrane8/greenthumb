import type { DataProvider, PricePoint, Quote, HistoryRange } from './provider.js'

/**
 * Stooq — a keyless EOD source (public CSV endpoints), the zero-config default.
 * US tickers use a `.us` suffix (e.g. `mstr.us`); we add it when no exchange
 * suffix is present. Closes are split/dividend adjusted, so they're safe to
 * backtest against.
 */

function normalize(symbol: string): string {
  const s = symbol.trim().toLowerCase()
  return s.includes('.') ? s : `${s}.us`
}

async function getCsv(url: string): Promise<string[][]> {
  const res = await fetch(url, { headers: { accept: 'text/csv' } })
  if (!res.ok) throw new Error(`Stooq request failed (${res.status})`)
  const text = await res.text()
  const rows = text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(','))
  return rows
}

export const stooqProvider: DataProvider = {
  id: 'stooq',
  label: 'Stooq (free EOD)',
  requiresKey: false,

  async quote(symbol: string): Promise<Quote> {
    const url = `https://stooq.com/q/l/?s=${encodeURIComponent(normalize(symbol))}&f=sd2t2ohlcv&h&e=csv`
    const rows = await getCsv(url)
    // header: Symbol,Date,Time,Open,High,Low,Close,Volume
    const header = rows[0]?.map((h) => h.trim().toLowerCase()) ?? []
    const data = rows[1]
    const closeIdx = header.indexOf('close')
    const close = data && closeIdx >= 0 ? Number(data[closeIdx]) : NaN
    if (!Number.isFinite(close)) throw new Error(`Stooq: no quote for "${symbol}"`)
    return { symbol, price: close, source: 'stooq', asOf: new Date().toISOString() }
  },

  async history(symbol: string, range: HistoryRange): Promise<PricePoint[]> {
    let url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(normalize(symbol))}&i=d`
    if (range.from) url += `&d1=${range.from.replace(/-/g, '')}`
    if (range.to) url += `&d2=${range.to.replace(/-/g, '')}`
    const rows = await getCsv(url)
    // header: Date,Open,High,Low,Close,Volume
    const header = rows[0]?.map((h) => h.trim().toLowerCase()) ?? []
    const dateIdx = header.indexOf('date')
    const closeIdx = header.indexOf('close')
    if (dateIdx < 0 || closeIdx < 0) throw new Error(`Stooq: no history for "${symbol}"`)
    const points: PricePoint[] = []
    for (const r of rows.slice(1)) {
      const date = r[dateIdx]?.trim()
      const close = Number(r[closeIdx])
      if (date && Number.isFinite(close)) points.push({ date, close })
    }
    if (points.length === 0) throw new Error(`Stooq: no history for "${symbol}"`)
    return points
  },
}
