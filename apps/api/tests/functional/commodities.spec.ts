import { test } from '@japa/runner'

/**
 * Commodity price surface: listing commodities, binding a driver to a price
 * model (which generates its series), rejecting unknown models, and regenerating
 * after a timeline change. Uses the bitcoin_treasury template, whose `btc_price`
 * driver is already power-law bound.
 */
test.group('Commodity pricing endpoints', () => {
  async function createTreasury(client: any): Promise<any> {
    const res = await client.post('/api/models').json({ name: 'Commodity Treasury', type: 'bitcoin_treasury' })
    res.assertStatus(201)
    return res.body().model
  }

  test('lists commodities and their models', async ({ client, assert }) => {
    const res = await client.get('/api/commodities')
    res.assertStatus(200)
    const commodities = res.body()
    const btc = commodities.find((c: any) => c.id === 'bitcoin')
    assert.ok(btc, 'bitcoin listed')
    assert.ok(btc.models.some((m: any) => m.id === 'powerlaw'))
  })

  test('preview returns a finite series with per-period labels', async ({ client, assert }) => {
    const res = await client.get('/api/commodities/bitcoin/powerlaw/preview')
    res.assertStatus(200)
    const body = res.body()
    assert.equal(body.series.length, body.periods)
    assert.equal(body.labels.length, body.periods)
    assert.isTrue(body.series.every((v: number) => Number.isFinite(v) && v > 0))
  })

  test('preview spot override pins period 0', async ({ client, assert }) => {
    const res = await client.get('/api/commodities/bitcoin/powerlaw/preview').qs({ spot: 50000, periods: 12 })
    res.assertStatus(200)
    assert.equal(res.body().series.length, 12)
    assert.closeTo(res.body().series[0], 50000, 1)
  })

  test('preview for an unknown model returns 404', async ({ client }) => {
    const res = await client.get('/api/commodities/unobtainium/magic/preview')
    res.assertStatus(404)
  })

  test('the treasury btc_price driver is power-law bound with a generated series', async ({ client, assert }) => {
    const model = await createTreasury(client)
    const btc = model.drivers.find((d: any) => d.name === 'btc_price')
    assert.equal(btc.priceModel.commodity, 'bitcoin')
    assert.equal(btc.priceModel.model, 'powerlaw')
    assert.equal(btc.values.length, model.timeline.periods)
    // period 0 pinned to the spot anchor
    assert.closeTo(btc.values[0], 62850, 1)
  })

  test('binding a driver generates its series', async ({ client, assert }) => {
    const model = await createTreasury(client)
    const btc = model.drivers.find((d: any) => d.name === 'btc_price')
    const res = await client
      .put(`/api/models/${model.id}/drivers/${btc.id}/commodity`)
      .json({ commodity: 'bitcoin', model: 'powerlaw', params: { band: 'support' } })
    res.assertStatus(200)
    const updated = res.body().model.drivers.find((d: any) => d.id === btc.id)
    assert.equal(updated.priceModel.params.band, 'support')
    assert.equal(updated.values.length, model.timeline.periods)
  })

  test('binding to an unknown model returns 422', async ({ client, assert }) => {
    const model = await createTreasury(client)
    const btc = model.drivers.find((d: any) => d.name === 'btc_price')
    const res = await client
      .put(`/api/models/${model.id}/drivers/${btc.id}/commodity`)
      .json({ commodity: 'unobtainium', model: 'magic', params: {} })
    res.assertStatus(422)
    assert.isTrue(res.body().issues.some((i: any) => i.code === 'UNKNOWN_PRICE_MODEL'))
  })

  test('resizing the timeline regenerates the bound price series', async ({ client, assert }) => {
    const model = await createTreasury(client)
    assert.equal(model.timeline.periods, 16)
    const res = await client.put(`/api/models/${model.id}/timeline`).json({ periods: 24 })
    res.assertStatus(200)
    const btc = res.body().model.drivers.find((d: any) => d.name === 'btc_price')
    assert.equal(btc.values.length, 24, 'price regenerated for the new horizon')
    assert.closeTo(btc.values[0], 62850, 1)
  })

  test('setting an alternate scenario commodity price diverges from base only', async ({ client, assert }) => {
    const model = await createTreasury(client)
    const btc = model.drivers.find((d: any) => d.name === 'btc_price')
    const base = model.scenarios.find((s: any) => s.name.toLowerCase() === 'base') ?? model.scenarios[0]
    const alt = model.scenarios.find((s: any) => s.name === 'Drawdown')
    const res = await client
      .put(`/api/models/${model.id}/scenarios/${alt.id}/drivers/${btc.id}/commodity`)
      .json({ commodity: 'bitcoin', model: 'powerlaw', params: { spot: 20000, band: 'fair' } })
    res.assertStatus(200)
    const updated = res.body().model
    const altAfter = updated.scenarios.find((s: any) => s.id === alt.id)
    assert.equal(altAfter.priceModels[btc.id].params.spot, 20000)
    assert.closeTo(altAfter.overrides[btc.id][0], 20000, 1)
    // base binding untouched
    const baseAfter = updated.scenarios.find((s: any) => s.id === base.id)
    assert.isUndefined(baseAfter.priceModels?.[btc.id])
  })

  test('setting the base scenario commodity price moves the base binding', async ({ client, assert }) => {
    const model = await createTreasury(client)
    const btc = model.drivers.find((d: any) => d.name === 'btc_price')
    const base = model.scenarios.find((s: any) => s.name.toLowerCase() === 'base') ?? model.scenarios[0]
    const res = await client
      .put(`/api/models/${model.id}/scenarios/${base.id}/drivers/${btc.id}/commodity`)
      .json({ commodity: 'bitcoin', model: 'powerlaw', params: { spot: 80000, band: 'fair' } })
    res.assertStatus(200)
    const driver = res.body().model.drivers.find((d: any) => d.id === btc.id)
    assert.equal(driver.priceModel.params.spot, 80000)
  })

  test('scenario commodity binding to an unknown model returns 422', async ({ client, assert }) => {
    const model = await createTreasury(client)
    const btc = model.drivers.find((d: any) => d.name === 'btc_price')
    const alt = model.scenarios.find((s: any) => s.name === 'Drawdown')
    const res = await client
      .put(`/api/models/${model.id}/scenarios/${alt.id}/drivers/${btc.id}/commodity`)
      .json({ commodity: 'gold', model: 'nope', params: {} })
    res.assertStatus(422)
    assert.isTrue(res.body().issues.some((i: any) => i.code === 'UNKNOWN_PRICE_MODEL'))
  })

  test('?preview=true does not persist a rebind', async ({ client, assert }) => {
    const model = await createTreasury(client)
    const btc = model.drivers.find((d: any) => d.name === 'btc_price')
    const res = await client
      .put(`/api/models/${model.id}/drivers/${btc.id}/commodity`)
      .qs({ preview: 'true' })
      .json({ commodity: 'bitcoin', model: 'powerlaw', params: { band: 'resistance' } })
    res.assertStatus(200)
    assert.isTrue(res.body().previewed)
    const fresh = (await client.get(`/api/models/${model.id}`)).body()
    const freshBtc = fresh.drivers.find((d: any) => d.name === 'btc_price')
    assert.equal(freshBtc.priceModel.params.band, 'fair', 'still the persisted fair band')
  })
})
