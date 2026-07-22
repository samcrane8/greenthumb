import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { parseLatest, parseObservations, type FredObservations } from '#services/market_data/fred_provider'

/**
 * Pure-parser tests for the FRED provider — run against a captured
 * series/observations fixture (M2SL, incl. a missing "." value) so no case touches
 * the live network. Covers the latest-observation quote, ranged history with
 * missing-value skipping + from/to filtering, and clear errors on a bad payload.
 */

async function fixture(): Promise<FredObservations> {
  const raw = await readFile(new URL('./fixtures/fred_m2sl.json', import.meta.url), 'utf-8')
  return JSON.parse(raw) as FredObservations
}

test.group('FRED provider parser', () => {
  test('parseLatest reads the first (latest, desc-ordered) observation', async ({ assert }) => {
    // The provider requests sort_order=desc&limit=1, so observations[0] is the latest.
    const desc: FredObservations = { observations: [{ date: '2020-05-01', value: '18135.4' }] }
    const q = parseLatest(desc, 'M2SL')
    assert.equal(q.symbol, 'M2SL')
    assert.closeTo(q.price, 18135.4, 1e-6)
    assert.equal(q.source, 'fred')
    assert.equal(q.asOf, '2020-05-01T00:00:00Z')
  })

  test('parseLatest throws on a missing/"." latest value', async ({ assert }) => {
    assert.throws(() => parseLatest({ observations: [{ date: '2020-03-01', value: '.' }] }, 'M2SL'), 'FRED: no quote for "M2SL"')
    assert.throws(() => parseLatest({} as FredObservations, 'M2SL'), 'FRED: no quote for "M2SL"')
  })

  test('parseObservations returns sorted dated closes, skipping "." values', async ({ assert }) => {
    const points = parseObservations(await fixture(), 'M2SL', {})
    // 5 observations, one is "." -> 4 points
    assert.lengthOf(points, 4)
    assert.deepEqual(
      points.map((p) => p.date),
      ['2020-01-01', '2020-02-01', '2020-04-01', '2020-05-01'],
    )
    assert.closeTo(points[0].close, 15406.5, 1e-6)
    assert.notInclude(
      points.map((p) => p.date),
      '2020-03-01',
      'the "." observation is skipped',
    )
  })

  test('parseObservations honors the from/to range filter', async ({ assert }) => {
    const points = parseObservations(await fixture(), 'M2SL', { from: '2020-02-01', to: '2020-04-30' })
    assert.deepEqual(
      points.map((p) => p.date),
      ['2020-02-01', '2020-04-01'],
    )
  })

  test('an all-missing / empty payload throws a clear error', async ({ assert }) => {
    assert.throws(() => parseObservations({ observations: [{ date: '2020-03-01', value: '.' }] }, 'M2SL', {}), 'FRED: no history for "M2SL"')
    assert.throws(() => parseObservations({} as FredObservations, 'M2SL', {}), 'FRED: no history for "M2SL"')
  })
})
