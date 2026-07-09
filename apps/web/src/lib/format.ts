/** Presentation helpers for the model grid and stat tiles. */

export function formatNumber(value: number, unit: string): string {
  if (!Number.isFinite(value)) return '—'
  switch (unit) {
    case 'currency':
      return compactCurrency(value)
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
