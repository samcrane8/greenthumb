import { test } from '@japa/runner'

/**
 * Model-editing HTTP surface: timeline resize, rename (with formula cascade),
 * notes, deletion, and the lean ?summary=true response mode. Uses the
 * bitcoin_treasury template (16 quarterly periods, rich formula graph).
 */
test.group('Model editing endpoints', () => {
  async function createTreasury(client: any, periods?: number): Promise<any> {
    const body: any = { name: 'Edit Treasury', type: 'bitcoin_treasury' }
    if (periods) body.timeline = { granularity: 'quarterly', periods }
    const res = await client.post('/api/models').json(body)
    res.assertStatus(201)
    return res.body().model
  }

  test('setTimeline trims the horizon', async ({ client, assert }) => {
    const model = await createTreasury(client)
    assert.equal(model.timeline.periods, 16)
    const res = await client.put(`/api/models/${model.id}/timeline`).json({ periods: 8 })
    res.assertStatus(200)
    assert.equal(res.body().model.timeline.periods, 8)
  })

  test('renaming a driver cascades into dependent formulas', async ({ client, assert }) => {
    const model = await createTreasury(client)
    const driver = model.drivers.find((d: any) => d.name === 'div_rate')
    const res = await client.put(`/api/models/${model.id}/drivers/${driver.id}/name`).json({ name: 'div_rate_annual' })
    res.assertStatus(200)
    const updated = res.body().model
    assert.isTrue(updated.drivers.some((d: any) => d.name === 'div_rate_annual'))
    const dividend = updated.items.find((i: any) => i.name === 'preferred_dividend')
    assert.include(dividend.definition.expression, 'div_rate_annual')
    assert.isTrue(res.body().ok)
  })

  test('renaming to an existing name returns 422', async ({ client, assert }) => {
    const model = await createTreasury(client)
    const driver = model.drivers.find((d: any) => d.name === 'div_rate')
    const res = await client.put(`/api/models/${model.id}/drivers/${driver.id}/name`).json({ name: 'cash_start' })
    res.assertStatus(422)
    assert.isTrue(res.body().issues.some((i: any) => i.code === 'DUPLICATE_NAME'))
  })

  test('removing a referenced driver returns 422', async ({ client, assert }) => {
    const model = await createTreasury(client)
    const debt = model.drivers.find((d: any) => d.name === 'debt_notional')
    const res = await client.delete(`/api/models/${model.id}/drivers/${debt.id}`)
    res.assertStatus(422)
    assert.isTrue(res.body().issues.some((i: any) => i.code === 'DANGLING_REF'))
  })

  test('removing an extra scenario succeeds', async ({ client, assert }) => {
    const model = await createTreasury(client)
    const drawdown = model.scenarios.find((s: any) => s.name === 'Drawdown')
    const before = model.scenarios.length
    const res = await client.delete(`/api/models/${model.id}/scenarios/${drawdown.id}`)
    res.assertStatus(200)
    assert.equal(res.body().model.scenarios.length, before - 1)
  })

  test('?summary=true omits the full model and returns the change', async ({ client, assert }) => {
    const model = await createTreasury(client)
    const scenario = model.scenarios.find((s: any) => s.name === 'Drawdown')
    const res = await client
      .put(`/api/models/${model.id}/scenarios/${scenario.id}/name`)
      .qs({ summary: 'true' })
      .json({ name: 'Bear' })
    res.assertStatus(200)
    const body = res.body()
    assert.isUndefined(body.model, 'full model omitted')
    assert.equal(body.change.op, 'rename')
    assert.equal(body.change.entity, 'scenario')
    assert.isTrue(body.ok)
  })

  test('setting a driver note updates the annotation', async ({ client, assert }) => {
    const model = await createTreasury(client)
    const driver = model.drivers.find((d: any) => d.name === 'other_holdings')
    const res = await client
      .put(`/api/models/${model.id}/drivers/${driver.id}/notes`)
      .json({ notes: 'STRC only (corrected)' })
    res.assertStatus(200)
    const updated = res.body().model.drivers.find((d: any) => d.id === driver.id)
    assert.equal(updated.notes, 'STRC only (corrected)')
  })
})
