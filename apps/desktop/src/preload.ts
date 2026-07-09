import { contextBridge } from 'electron'

/**
 * Minimal, safe bridge. The UI talks to the engine over HTTP (same as the web
 * app), so we expose only environment hints here — no Node APIs reach the page.
 */
contextBridge.exposeInMainWorld('greenthumb', {
  desktop: true,
  platform: process.platform,
})
