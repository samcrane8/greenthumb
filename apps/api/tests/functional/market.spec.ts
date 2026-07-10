import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { registerProvider, __clearCache } from '#services/market_data/index'

/**
 * Market-data endpoints. Uses a deterministic STUB provider registered in-process
 * so no test ever hits the live network. Verifies fetch reads, materialization
 * into the existing actuals store (with provenance + actualsThrough), driver
 * seeding, and that provider keys never leak into a serialized model.
 */

// A stub provider: monthly closes 2024-01..2027-12, close = 100 + monthIndex.
const STUB_ID = 'test-stub'
function stubPoints() {
  const points: { date: string; close: number }[] = []
  let idx = 0
  for (let y = 2024; y <= 2027; y++) {
    for (let m = 1; m <= 12; m++) {
      points.push({ date: `${y}-${String(m).padStart(2, '0')}-01`, close: 100 + idx })
      idx++
    }
  }
  return points
}
registerProvider({
  id: STUB_ID,
  label: 'Test Stub',
  requiresKey: false,
  async quote(symbol) {
    return { symbol, price: 4242, source: STUB_ID, asOf: new Date().toISOString() }
  },
  async history() {
    return stubPoints()
  },
})

test.group('Market-data endpoints', (group) => {
  group.setup(() => testUtils.db().migrate()) // ensure the `actuals` table exists
  group.each.setup(() => __clearCache())

  async function createSaas(client: any): Promise<any> {
    const res = await client.post('/api/models').json({ name: 'Market SaaS', type: 'saas' })
    res.assertStatus(201)
    return res.body().model
  }

  test('lists providers including the keyless default and the stub', async ({ client, assert }) => {
    const res = await client.get('/api/market/providers')
    res.assertStatus(200)
    const ids = res.body().map((p: any) => p.id)
    assert.include(ids, 'stooq')
    assert.include(ids, STUB_ID)
    const stooq = res.body().find((p: any) => p.id === 'stooq')
    assert.isFalse(stooq.requiresKey)
    assert.isTrue(stooq.configured, 'keyless provider is always configured')
  })

  test('fetches a quote from the stub provider', async ({ client, assert }) => {
    const res = await client.get('/api/market/AAPL/quote').qs({ provider: STUB_ID })
    res.assertStatus(200)
    assert.equal(res.body().price, 4242)
    assert.equal(res.body().source, STUB_ID)
    assert.isString(res.body().asOf)
  })

  test('fetches price history', async ({ client, assert }) => {
    const res = await client.get('/api/market/AAPL/history').qs({ provider: STUB_ID })
    res.assertStatus(200)
    assert.isAbove(res.body().points.length, 0)
    assert.property(res.body().points[0], 'close')
  })

  test('unknown provider errors clearly', async ({ client }) => {
    const res = await client.get('/api/market/AAPL/quote').qs({ provider: 'does-not-exist' })
    res.assertStatus(400)
  })

  test('import-market populates actuals, advances actualsThrough, and records source', async ({
    client,
    assert,
  }) => {
    const model = await createSaas(client) // monthly, 36 periods, starts 2026-01-01
    const res = await client
      .post(`/api/models/${model.id}/actuals/import-market`)
      .qs({ provider: STUB_ID })
      .json({ symbol: 'AAPL', item: 'mrr' })
    res.assertStatus(200)
    const body = res.body()
    assert.isAbove(body.ingested, 0, 'some periods ingested')
    assert.isAbove(body.actualsThrough, -1, 'actualsThrough advanced')
    assert.include(body.source, 'AAPL')
    assert.isString(body.asOf)
  })

  test('imported actuals are available to the forecast-vs-actual join', async ({ client }) => {
    const model = await createSaas(client)
    await client
      .post(`/api/models/${model.id}/actuals/import-market`)
      .qs({ provider: STUB_ID })
      .json({ symbol: 'AAPL', item: 'mrr' })
    const res = await client.get(`/api/models/${model.id}/forecast-actual`).qs({ item: 'mrr' })
    res.assertStatus(200)
  })

  test('seed-from-quote sets the driver value', async ({ client, assert }) => {
    const model = await createSaas(client)
    const driver = model.drivers.find((d: any) => d.name === 'arpa')
    const res = await client
      .put(`/api/models/${model.id}/drivers/${driver.id}/seed-from-quote`)
      .qs({ provider: STUB_ID })
      .json({ symbol: 'AAPL' })
    res.assertStatus(200)
    const updated = res.body().model.drivers.find((d: any) => d.id === driver.id)
    assert.equal(updated.values[0], 4242)
    assert.equal(res.body().seeded.source, STUB_ID)
  })

  test('a provider key never appears in a serialized model', async ({ client, assert }) => {
    // configure a fake key for the (keyed) alphavantage provider
    await client.put('/api/market/config').json({ provider: 'alphavantage', key: 'SECRET-KEY-123' })
    const model = await createSaas(client)
    // import via the keyless stub (no network); then fetch the stored model
    await client
      .post(`/api/models/${model.id}/actuals/import-market`)
      .qs({ provider: STUB_ID })
      .json({ symbol: 'AAPL', item: 'mrr' })
    const stored = await client.get(`/api/models/${model.id}`)
    assert.notInclude(JSON.stringify(stored.body()), 'SECRET-KEY-123')
    // and the providers endpoint reports configured without leaking the key
    const providers = await client.get('/api/market/providers')
    assert.notInclude(JSON.stringify(providers.body()), 'SECRET-KEY-123')
    assert.isTrue(providers.body().find((p: any) => p.id === 'alphavantage').configured)
  })
})
