import { useSyncExternalStore } from 'react'
import type { CloudConnection } from '@/lib/apiTarget'

/**
 * Client-side settings store — profile, display preferences, and the optional
 * cloud connection. Persisted in localStorage so it survives reloads, behaves
 * identically in the browser and the Electron shell, and produces zero network
 * egress in local mode. Exposed via `useSettings()` (a `useSyncExternalStore`
 * subscription) and a non-hook `getSettings()` for the API layer.
 *
 * All browser-API access is guarded so this module can be imported in a plain
 * Node context (e.g. tests) without touching `window`/`document`.
 */

export type Theme = 'light' | 'dark' | 'system'
export type NumberFormat = 'standard' | 'compact'

export interface Profile {
  name: string
  email: string
}

export interface DisplaySettings {
  theme: Theme
  currency: string
  numberFormat: NumberFormat
}

export interface Settings {
  profile: Profile
  display: DisplaySettings
  cloud: CloudConnection
}

const STORAGE_KEY = 'greenthumb.settings.v1'

const DEFAULTS: Settings = {
  profile: { name: '', email: '' },
  display: { theme: 'system', currency: 'USD', numberFormat: 'standard' },
  cloud: { url: '', apiKey: '', connected: false },
}

const hasWindow = typeof window !== 'undefined'

function load(): Settings {
  if (!hasWindow) return DEFAULTS
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<Settings>
    // Merge over defaults so newly-added fields are always present.
    return {
      profile: { ...DEFAULTS.profile, ...parsed.profile },
      display: { ...DEFAULTS.display, ...parsed.display },
      cloud: { ...DEFAULTS.cloud, ...parsed.cloud },
    }
  } catch {
    return DEFAULTS
  }
}

let state: Settings = load()
const listeners = new Set<() => void>()

function persist() {
  if (!hasWindow) return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Ignore quota / private-mode failures — in-memory state still works.
  }
}

function emit() {
  for (const l of listeners) l()
}

/** Non-hook accessor for modules that can't use hooks (e.g. the API client). */
export function getSettings(): Settings {
  return state
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

function commit(next: Settings) {
  state = next
  persist()
  applyTheme(state.display.theme)
  emit()
}

export function setProfile(patch: Partial<Profile>) {
  commit({ ...state, profile: { ...state.profile, ...patch } })
}

export function setDisplay(patch: Partial<DisplaySettings>) {
  commit({ ...state, display: { ...state.display, ...patch } })
}

export function connectCloud(url: string, apiKey: string) {
  commit({ ...state, cloud: { url: url.trim(), apiKey: apiKey.trim(), connected: true } })
}

export function disconnectCloud() {
  commit({ ...state, cloud: { url: '', apiKey: '', connected: false } })
}

// --- Theme application -----------------------------------------------------

function effectiveDark(theme: Theme): boolean {
  if (theme === 'dark') return true
  if (theme === 'light') return false
  return hasWindow && window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** Toggle the `dark` class Tailwind v4 keys off (see index.css @custom-variant). */
export function applyTheme(theme: Theme) {
  if (!hasWindow) return
  document.documentElement.classList.toggle('dark', effectiveDark(theme))
}

// Apply the persisted theme immediately on load, and re-apply on OS changes
// while the preference is "system".
if (hasWindow) {
  applyTheme(state.display.theme)
  window
    .matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', () => {
      if (state.display.theme === 'system') applyTheme('system')
    })
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings, getSettings)
}
