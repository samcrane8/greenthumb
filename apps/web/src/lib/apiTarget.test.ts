import { describe, it, expect } from 'vitest'
import { resolveTarget } from './apiTarget'

const ENV = { base: '', key: undefined } as const
const ENV_WITH_KEY = { base: 'http://localhost:3333', key: 'env-key' } as const

describe('resolveTarget', () => {
  it('falls back to env when no cloud connection is set', () => {
    expect(resolveTarget({ url: '', apiKey: '', connected: false }, ENV)).toEqual({
      base: '',
      key: undefined,
    })
  })

  it('uses the build-time env base and key when disconnected', () => {
    expect(
      resolveTarget({ url: 'https://ignored.example', apiKey: 'ignored', connected: false }, ENV_WITH_KEY)
    ).toEqual({ base: 'http://localhost:3333', key: 'env-key' })
  })

  it('cloud connection wins over env when connected', () => {
    expect(
      resolveTarget(
        { url: 'https://acme.greenthumb.app/', apiKey: 'cloud-key', connected: true },
        ENV_WITH_KEY
      )
    ).toEqual({ base: 'https://acme.greenthumb.app', key: 'cloud-key' })
  })

  it('strips trailing slashes from the cloud URL', () => {
    expect(
      resolveTarget({ url: 'https://acme.greenthumb.app///', apiKey: 'k', connected: true }, ENV)
    ).toEqual({ base: 'https://acme.greenthumb.app', key: 'k' })
  })

  it('treats a blank cloud key as no key', () => {
    expect(
      resolveTarget({ url: 'https://acme.greenthumb.app', apiKey: '   ', connected: true }, ENV)
    ).toEqual({ base: 'https://acme.greenthumb.app', key: undefined })
  })

  it('ignores a connected flag when the URL is blank', () => {
    expect(resolveTarget({ url: '   ', apiKey: 'k', connected: true }, ENV_WITH_KEY)).toEqual({
      base: 'http://localhost:3333',
      key: 'env-key',
    })
  })
})
