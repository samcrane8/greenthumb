import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'

/**
 * Backtesting / model-improvement loop HTTP surface (handbook §3–4): ingest
 * actuals into SQLite, then score / backtest / tornado / calibrate over the core
 * engine. Migrations run per group so the `actuals` table exists.
 */
test.group('Analysis endpoints', (group) => {
  group.setup(() => testUtils.db().migrate())

  async function createSaas(client: any): Promise<any> {
    const res = await client
      .post('/api/models')
      .json({ name: 'Analysis SaaS', type: 'saas', timeline: { granularity: 'monthly', periods: 12 } })
    res.assertStatus(201)
    return res.body().model
  }

  /** The base-scenario forecast for an item, via the compute endpoint. */
  async function forecast(client: any, model: any, itemName: string): Promise<number[]> {
    const item = model.items.find((i: any) => i.name === itemName)
    const res = await client.get(`/api/models/${model.id}/compute`)
    res.assertStatus(200)
    return res.body().series[item.id]
  }

  test('ingest actuals then score forecast returns the full metric set', async ({ client, assert }) => {
    const model = await createSaas(client)
    const f = await forecast(client, model, 'mrr')
    // Perfect actuals (equal to the forecast) → zero error, zero bias.
    const ingest = await client.post(`/api/models/${model.id}/actuals`).json({ item: 'mrr', values: f, source: 'test' })
    ingest.assertStatus(200)
    assert.equal(ingest.body().ingested, f.length)

    const score = await client.get(`/api/models/${model.id}/score`).qs({ item: 'mrr' })
    score.assertStatus(200)
    const m = score.body().metrics
    assert.property(m, 'mae')
    assert.property(m, 'rmse')
    assert.property(m, 'mape')
    assert.property(m, 'bias')
    assert.isBelow(Math.abs(m.bias), 1e-6)
  })

  test('re-ingesting a period replaces rather than duplicates', async ({ client, assert }) => {
    const model = await createSaas(client)
    await client.post(`/api/models/${model.id}/actuals`).json({ item: 'mrr', period: 0, value: 100 })
    await client.post(`/api/models/${model.id}/actuals`).json({ item: 'mrr', period: 0, value: 250 })
    const join = await client.get(`/api/models/${model.id}/forecast-actual`).qs({ item: 'mrr' })
    join.assertStatus(200)
    assert.equal(join.body().rows[0].actual, 250)
  })

  test('backtest scores forecast vs actuals with residuals', async ({ client, assert }) => {
    const model = await createSaas(client)
    const f = await forecast(client, model, 'mrr')
    // Actuals overshoot the forecast by 10 for the first six periods.
    const values = f.map((v: number, i: number) => (i <= 5 ? v + 10 : null))
    await client.post(`/api/models/${model.id}/actuals`).json({ item: 'mrr', values })
    const bt = await client.get(`/api/models/${model.id}/backtest`).qs({ item: 'mrr' })
    bt.assertStatus(200)
    assert.equal(bt.body().window.to, 5)
    assert.isBelow(Math.abs(bt.body().metrics.bias + 10), 1e-6) // systematic under-forecast
  })

  test('backtest errors loudly when the item has no actuals', async ({ client }) => {
    const model = await createSaas(client)
    const bt = await client.get(`/api/models/${model.id}/backtest`).qs({ item: 'mrr' })
    bt.assertStatus(400)
  })

  test('tornado ranks drivers by output impact', async ({ client, assert }) => {
    const model = await createSaas(client)
    const res = await client.get(`/api/models/${model.id}/tornado`).qs({ item: 'ebitda' })
    res.assertStatus(200)
    const rows = res.body().rows
    assert.isAbove(rows.length, 0)
    for (let i = 1; i < rows.length; i++) assert.isAtLeast(rows[i - 1].impact, rows[i].impact)
  })

  test('calibrate returns a candidate without committing', async ({ client, assert }) => {
    const model = await createSaas(client)
    // Truth: arpa=700 (the model ships with 500). Feed mrr@700 as actuals.
    const res700 = await client
      .get(`/api/models/${model.id}/compute`)
      .qs({}) // base compute at arpa=500 first, then we synthesize target via sweep
    res700.assertStatus(200)
    // Synthesize actuals for arpa=700 via the sweep endpoint.
    const sweep = await client
      .get(`/api/models/${model.id}/sweep`)
      .qs({ driver: 'arpa', values: '700', item: 'mrr' })
    sweep.assertStatus(200)
    const actuals = sweep.body().points[0].output
    await client.post(`/api/models/${model.id}/actuals`).json({ item: 'mrr', values: actuals })

    const cal = await client.post(`/api/models/${model.id}/calibrate`).json({
      item: 'mrr',
      drivers: ['arpa'],
      metric: 'rmse',
      window: { from: 0, to: 5 },
      bounds: { arpa: { min: 400, max: 900 } },
    })
    cal.assertStatus(200)
    const candidate = cal.body().candidate
    const arpa = model.drivers.find((d: any) => d.name === 'arpa')
    assert.isBelow(Math.abs(candidate.bestValues[arpa.id] - 700), 20)

    // The stored model is unchanged — calibration never commits.
    const after = await client.get(`/api/models/${model.id}`)
    const arpaAfter = after.body().drivers.find((d: any) => d.name === 'arpa')
    assert.equal(arpaAfter.values[0], 500)
  })
})
