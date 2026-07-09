import { test } from '@japa/runner'
import env from '#start/env'

/**
 * GET /api/info — the deployment posture endpoint (ungated, no secrets).
 * Verifies the Local vs Cloud mapping the web account section relies on.
 */
test.group('GET /api/info', (group) => {
  // Restore whatever API_KEY the test env started with after each test.
  const original = env.get('API_KEY')
  group.each.teardown(() => {
    env.set('API_KEY', (original ?? '') as string)
  })

  test('local posture when no API_KEY is configured', async ({ client, assert }) => {
    env.set('API_KEY', '')

    const res = await client.get('/api/info')

    res.assertStatus(200)
    res.assertBodyContains({ mode: 'local', requiresApiKey: false })
    const body = res.body()
    assert.isString(body.version)
    // Never leak the key (there is none here, but the field must not exist).
    assert.notProperty(body, 'apiKey')
    assert.notProperty(body, 'API_KEY')
  })

  test('cloud posture is reachable without a bearer token and hides the key', async ({
    client,
    assert,
  }) => {
    env.set('API_KEY', 'super-secret-key')

    // No authorization header on purpose — the endpoint is ungated.
    const res = await client.get('/api/info')

    res.assertStatus(200)
    res.assertBodyContains({ mode: 'cloud', requiresApiKey: true })
    const body = res.body()
    assert.notProperty(body, 'apiKey')
    assert.notInclude(JSON.stringify(body), 'super-secret-key')
  })
})
