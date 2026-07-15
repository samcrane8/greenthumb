import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { parseQuote, parseHistory, type YahooChart } from '#services/market_data/yahoo_provider'

/**
 * Pure-parser tests for the Yahoo provider — run against a captured v8 chart
 * fixture (MSTR, 5 daily bars) so no case touches the live network. Covers the
 * quote read, adjusted-close history with a from/to filter, and clear errors on
 * a malformed payload.
 */

async function fixture(): Promise<YahooChart> {
  const raw = await readFile(new URL('./fixtures/yahoo_mstr_5d.json', import.meta.url), 'utf-8')
  return JSON.parse(raw) as YahooChart
}

test.group('Yahoo provider parser', () => {
  test('parseQuote reads price, source, and as-of from meta', async ({ assert }) => {
    const q = parseQuote(await fixture(), 'MSTR')
    assert.equal(q.symbol, 'MSTR')
    assert.closeTo(q.price, 97.662, 1e-6)
    assert.equal(q.source, 'yahoo')
    assert.equal(q.asOf, '2026-07-15T16:22:22.000Z')
  })

  test('parseHistory returns sorted adjusted daily closes', async ({ assert }) => {
    const points = await parseHistory(await fixture(), 'MSTR', {})
    assert.lengthOf(points, 5)
    assert.equal(points[0].date, '2026-07-09')
    assert.closeTo(points[0].close, 93.89, 1e-2)
    assert.equal(points[points.length - 1].date, '2026-07-15')
    // ascending by date
    const dates = points.map((p) => p.date)
    assert.deepEqual(dates, [...dates].sort())
  })

  test('parseHistory honors the from/to range filter', async ({ assert }) => {
    const points = parseHistory(await fixture(), 'MSTR', { from: '2026-07-10', to: '2026-07-14' })
    assert.deepEqual(
      points.map((p) => p.date),
      ['2026-07-10', '2026-07-13', '2026-07-14']
    )
  })

  test('a malformed payload throws a clear error', async ({ assert }) => {
    assert.throws(() => parseQuote({} as YahooChart, 'MSTR'), 'Yahoo: no quote for "MSTR"')
    assert.throws(() => parseHistory({} as YahooChart, 'MSTR', {}), 'Yahoo: no history for "MSTR"')
  })
})
