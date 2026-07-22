/** Presentation helpers for the model grid and stat tiles. */

/**
 * Human label for a line-item / row name. When the model carries a `ticker`
 * (ticker-aware templates like `bitcoin_treasury`) and the name is prefixed with
 * that ticker (e.g. `mstr_price`), render the ticker uppercased — "MSTR price" —
 * so the company identity reads correctly. Otherwise turn underscores into spaces.
 */
export function itemLabel(name: string, ticker?: string): string {
  if (ticker) {
    const prefix = `${ticker.toLowerCase()}_`
    if (name.toLowerCase().startsWith(prefix)) {
      return `${ticker.toUpperCase()} ${name.slice(prefix.length).replace(/_/g, ' ')}`
    }
  }
  return name.replace(/_/g, ' ')
}

/**
 * Format a value for display. `scale` is a display magnitude (e.g. 1_000_000 when
 * the value is stored in $millions) — presentation only, applied to currency so a
 * $M-denominated figure renders at its true size. Percent values are stored as
 * decimal fractions (0.105 → 10.5%).
 */
export function formatNumber(value: number, unit: string, scale = 1): string {
  if (!Number.isFinite(value)) return '—'
  switch (unit) {
    case 'currency':
      return compactCurrency(value * (scale || 1))
    case 'percent':
      return `${(value * 100).toFixed(1)}%`
    case 'count':
      return Math.round(value).toLocaleString()
    case 'ratio':
      return value.toFixed(2)
    default:
      return value.toLocaleString(undefined, { maximumFractionDigits: 1 })
  }
}

/**
 * A short unit hint for annotating a column or tile, so a reader can tell a
 * dollar figure from a ratio from a percentage at a glance. Because
 * `formatNumber` renders currency at true magnitude (…K/M/B), the hint marks the
 * quantity *type* — `$`, `%`, `×`, `#` — not the storage scale.
 */
export function unitHint(unit: string): string {
  switch (unit) {
    case 'currency':
      return '$'
    case 'percent':
      return '%'
    case 'ratio':
      return '×'
    case 'count':
      return '#'
    default:
      return ''
  }
}

function compactCurrency(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`
  return `${sign}$${abs.toFixed(0)}`
}

/** Period label from a timeline start + granularity. */
export function periodLabel(startISO: string, granularity: string, index: number): string {
  const start = new Date(startISO)
  if (granularity === 'annual') return `FY${start.getUTCFullYear() + index}`
  if (granularity === 'quarterly') {
    const q = (start.getUTCMonth() / 3 + index) % 4
    const yr = start.getUTCFullYear() + Math.floor((start.getUTCMonth() / 3 + index) / 4)
    return `Q${Math.floor(q) + 1} ${String(yr).slice(2)}`
  }
  const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + index, 1))
  return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit', timeZone: 'UTC' })
}
