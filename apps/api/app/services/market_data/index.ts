import { periodDate, type Timeline } from '@greenthumb/core'

import { registerProvider, type PricePoint } from './provider.js'
import { stooqProvider } from './stooq_provider.js'
import { alphaVantageProvider } from './alphavantage_provider.js'
import { demoProvider } from './demo_provider.js'

// Register the built-in providers once at import time.
registerProvider(stooqProvider)
registerProvider(alphaVantageProvider)
registerProvider(demoProvider)

export * from './provider.js'
export { keyFor, isConfigured, setKey } from './config.js'

/**
 * Align a provider's daily price history to a model's timeline: for each period,
 * pick the close on-or-before that period's calendar date (via core's periodDate).
 * Periods before the first data point are null (no observation). Returns a
 * `(number|null)[]` of length `timeline.periods`, ready for the actuals store.
 */
export function alignHistoryToTimeline(history: PricePoint[], timeline: Timeline): (number | null)[] {
  const points = [...history].sort((a, b) => (a.date < b.date ? -1 : 1))
  const out: (number | null)[] = new Array(timeline.periods).fill(null)
  for (let i = 0; i < timeline.periods; i++) {
    const target = isoDate(periodDate(timeline, i))
    // last point with date <= target
    let lo = 0
    let hi = points.length - 1
    let found = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (points[mid]!.date <= target) {
        found = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }
    out[i] = found >= 0 ? points[found]!.close : null
  }
  return out
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}
