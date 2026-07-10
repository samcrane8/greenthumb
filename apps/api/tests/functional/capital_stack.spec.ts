import { test } from '@japa/runner'

/**
 * Capital-stack HTTP surface: tranche CRUD, dangling-ref rejection, preview, and
 * the derived seniority-waterfall analysis (with the treasury tie-out).
 */
test.group('Capital-stack endpoints', () => {
  async function createTreasury(client: any): Promise<any> {
    const res = await client.post('/api/models').json({ name: 'Stack Treasury', type: 'bitcoin_treasury' })
    res.assertStatus(201)
    return res.body().model
  }

  test('treasury model ships a default capital stack', async ({ client, assert }) => {
    const model = await createTreasury(client)
    assert.exists(model.capitalStack)
    const kinds = model.capitalStack.tranches.map((t: any) => t.kind)
    assert.include(kinds, 'senior_debt')
    assert.include(kinds, 'preferred')
    assert.include(kinds, 'common')
  })

  test('analysis returns per-tranche results and residual, tying out to nav_to_common', async ({
    client,
    assert,
  }) => {
    const model = await createTreasury(client)
    const res = await client.get(`/api/models/${model.id}/capital-stack/analysis`)
    res.assertStatus(200)
    const a = res.body()
    // Senior debt, Convertible (face value), Preferred, Common.
    assert.equal(a.tranches.length, 4)
    assert.equal(a.residualToCommon.length, model.timeline.periods)
    // tie-out: residual == max(0, nav_to_common)
    const nav = (await client.get(`/api/models/${model.id}/compute`)).body().series
    const navId = model.items.find((i: any) => i.name === 'nav_to_common').id
    const navSeries = nav[navId]
    for (let p = 0; p < model.timeline.periods; p++) {
      assert.closeTo(a.residualToCommon[p], Math.max(0, navSeries[p]), 1e-4)
    }
  })

  test('adding a tranche with a dangling ref returns 422', async ({ client, assert }) => {
    const model = await createTreasury(client)
    const res = await client
      .post(`/api/models/${model.id}/capital-stack/tranches`)
      .json({ name: 'Bad', kind: 'senior_debt', seniority: 5, notionalRef: 'nope_missing' })
    res.assertStatus(422)
    assert.isTrue(res.body().issues.some((i: any) => i.code === 'DANGLING_STACK_REF'))
  })

  test('add / update / remove a tranche', async ({ client, assert }) => {
    const model = await createTreasury(client)
    const add = await client
      .post(`/api/models/${model.id}/capital-stack/tranches`)
      .json({ name: 'Sub debt', kind: 'subordinated_debt', seniority: 15, notionalRef: 'debt_notional' })
    add.assertStatus(200)
    const tId = add.body().model.capitalStack.tranches.find((t: any) => t.name === 'Sub debt').id
    const up = await client.patch(`/api/models/${model.id}/capital-stack/tranches/${tId}`).json({ seniority: 12 })
    up.assertStatus(200)
    assert.equal(up.body().model.capitalStack.tranches.find((t: any) => t.id === tId).seniority, 12)
    const del = await client.delete(`/api/models/${model.id}/capital-stack/tranches/${tId}`)
    del.assertStatus(200)
    assert.isFalse(del.body().model.capitalStack.tranches.some((t: any) => t.id === tId))
  })

  test('?preview=true does not persist a tranche', async ({ client, assert }) => {
    const model = await createTreasury(client)
    const before = model.capitalStack.tranches.length
    const res = await client
      .post(`/api/models/${model.id}/capital-stack/tranches`)
      .qs({ preview: 'true' })
      .json({ name: 'Preview', kind: 'subordinated_debt', seniority: 15, notionalRef: 'debt_notional' })
    res.assertStatus(200)
    assert.isTrue(res.body().previewed)
    const after = (await client.get(`/api/models/${model.id}`)).body().capitalStack.tranches.length
    assert.equal(after, before)
  })
})
