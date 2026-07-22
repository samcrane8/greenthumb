import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'

/**
 * Ergonomics fixes: settable timeline start date, actuals-replay + restore, and
 * the lean (summary) response mode on edits.
 */
test.group('Ergonomics endpoints', (group) => {
  group.setup(() => testUtils.db().migrate())

  async function createSaas(client: any, timeline?: any): Promise<any> {
    const res = await client
      .post('/api/models')
      .json({ name: 'Ergo SaaS', type: 'saas', timeline: { granularity: 'monthly', periods: 12, ...timeline } })
    res.assertStatus(201)
    return res.body().model
  }

  test('start date is settable at creation', async ({ client, assert }) => {
    const model = await createSaas(client, { granularity: 'quarterly', start: '2020-07-01' })
    assert.equal(model.timeline.start, '2020-07-01')
  })

  test('start date is settable via set_timeline and re-anchors', async ({ client, assert }) => {
    const model = await createSaas(client)
    const res = await client.put(`/api/models/${model.id}/timeline`).json({ start: '2020-07-01' })
    res.assertStatus(200)
    assert.equal(res.body().model.timeline.start, '2020-07-01')
  })

  test('replay actuals swaps a formula item to an input series, then restore', async ({ client, assert }) => {
    const model = await createSaas(client)
    const mrr = model.items.find((i: any) => i.name === 'mrr')
    // Seed actuals, then replay without an explicit series (server seeds from the store).
    const values = new Array(12).fill(null).map((_: any, i: number) => (i < 6 ? 1000 + i * 100 : null))
    await client.post(`/api/models/${model.id}/actuals`).json({ item: 'mrr', values })

    const replay = await client.put(`/api/models/${model.id}/items/${mrr.id}/replay`).json({})
    replay.assertStatus(200)
    const replayed = replay.body().model.items.find((i: any) => i.id === mrr.id)
    assert.equal(replayed.definition.kind, 'input')
    assert.equal(replayed.definition.values[0], 1000)
    assert.exists(replayed.replacedDefinition, 'original formula preserved')

    const restore = await client.put(`/api/models/${model.id}/items/${mrr.id}/restore`).json({})
    restore.assertStatus(200)
    const restored = restore.body().model.items.find((i: any) => i.id === mrr.id)
    assert.equal(restored.definition.kind, 'formula')
  })

  test('summary response mode omits the full model', async ({ client, assert }) => {
    const model = await createSaas(client)
    const driver = model.drivers.find((d: any) => d.name === 'arpa')
    const res = await client
      .put(`/api/models/${model.id}/drivers/${driver.id}/assumption?summary=true`)
      .json({ values: [600] })
    res.assertStatus(200)
    assert.isUndefined(res.body().model, 'lean response has no full model')
    assert.exists(res.body().change, 'lean response carries the change summary')
    assert.property(res.body(), 'ok')
  })
})
