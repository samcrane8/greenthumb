import { test } from '@japa/runner'

/**
 * Chart + dashboard HTTP surface. Verifies the visualization endpoints reuse the
 * shared { model, issues, ok } / preview / 422 contract and that chart data is
 * derived per scenario. Uses the bitcoin_treasury template, which ships charts.
 */
test.group('Charts & dashboard endpoints', () => {
  async function createTreasury(client: any): Promise<string> {
    // Pin the ticker so the price item resolves as `asst_price` (default is `co_price`).
    const res = await client
      .post('/api/models')
      .json({ name: 'Test Treasury', type: 'bitcoin_treasury', ticker: 'ASST' })
    res.assertStatus(201)
    return res.body().model.id
  }

  test('template model is created with charts and a dashboard', async ({ client, assert }) => {
    const id = await createTreasury(client)
    const res = await client.get(`/api/models/${id}`)
    res.assertStatus(200)
    const model = res.body()
    assert.isArray(model.charts)
    assert.equal(model.charts.length, 5)
    assert.isArray(model.dashboard.widgets)
  })

  test('chart data is derived and reflects the scenario', async ({ client, assert }) => {
    const id = await createTreasury(client)
    const model = (await client.get(`/api/models/${id}`)).body()
    const indexed = model.charts.find((c: any) => c.series.some((s: any) => s.index))
    const base = model.scenarios[0].id
    const draw = model.scenarios[1].id

    const baseRes = await client.get(`/api/models/${id}/charts/${indexed.id}/data`).qs({ scenario: base })
    baseRes.assertStatus(200)
    const drawRes = await client.get(`/api/models/${id}/charts/${indexed.id}/data`).qs({ scenario: draw })
    drawRes.assertStatus(200)

    const asstBase = baseRes.body().series.find((s: any) => s.ref === 'asst_price').values
    const asstDraw = drawRes.body().series.find((s: any) => s.ref === 'asst_price').values
    // compare peaks — robust to where the halving-cycle oscillation lands at horizon end
    assert.isBelow(Math.max(...asstDraw), Math.max(...asstBase), 'drawdown scenario lowers the ASST path')
  })

  test('adding a chart with a dangling ref returns 422', async ({ client, assert }) => {
    const id = await createTreasury(client)
    const res = await client
      .post(`/api/models/${id}/charts`)
      .json({ title: 'Bad', kind: 'line', series: [{ ref: 'nope_not_real' }] })
    res.assertStatus(422)
    assert.isTrue(res.body().issues.some((i: any) => i.code === 'DANGLING_CHART_REF'))
  })

  test('preview does not persist a new chart', async ({ client, assert }) => {
    const id = await createTreasury(client)
    const before = (await client.get(`/api/models/${id}`)).body().charts.length
    const res = await client
      .post(`/api/models/${id}/charts`)
      .qs({ preview: 'true' })
      .json({ title: 'Preview only', kind: 'line', series: [{ ref: 'btc_price' }] })
    res.assertStatus(200)
    assert.isTrue(res.body().previewed)
    const after = (await client.get(`/api/models/${id}`)).body().charts.length
    assert.equal(after, before, 'preview did not persist')
  })

  test('reordering the dashboard preserves the widget set', async ({ client, assert }) => {
    const id = await createTreasury(client)
    const model = (await client.get(`/api/models/${id}`)).body()
    const ids = model.dashboard.widgets.map((w: any) => w.id)
    const reversed = [...ids].reverse()
    const res = await client.put(`/api/models/${id}/dashboard/order`).json({ order: reversed })
    res.assertStatus(200)
    const after = res.body().model.dashboard.widgets.map((w: any) => w.id)
    assert.deepEqual(after, reversed)
  })
})
