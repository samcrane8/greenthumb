import { app, BrowserWindow, shell } from 'electron'
import { fork, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import { existsSync } from 'node:fs'

/**
 * Electron main process (PRD §9.3).
 *
 * The desktop app is local-first: it boots the *same* AdonisJS engine the cloud
 * runs, but on localhost with data under the user's app-data directory — nothing
 * leaves the machine. In dev, the API and Vite dev server run externally (via
 * `pnpm dev`) and we just load the dev URL. In a packaged build, we fork the
 * bundled API and load the built React UI from disk.
 */

const API_PORT = 3333
const API_HOST = '127.0.0.1'
const HEALTH_URL = `http://${API_HOST}:${API_PORT}/health`
const isDev = !app.isPackaged
const DEV_URL = process.env.VITE_DEV_SERVER_URL

let apiProcess: ChildProcess | null = null
let mainWindow: BrowserWindow | null = null

/** Resolve a bundled resource, whether packaged (resourcesPath) or run from source. */
function resource(...segments: string[]): string {
  const packaged = path.join(process.resourcesPath, ...segments)
  if (existsSync(packaged)) return packaged
  // Unpackaged fallback (e.g. `electron .` after prepackage): reach into the monorepo.
  return path.join(__dirname, '..', '..', ...segments)
}

/** Fork the built AdonisJS server as a Node process (Electron acts as Node). */
function startApi(): void {
  const entry = resource('api', 'bin', 'server.js')
  const dataDir = app.getPath('userData')
  apiProcess = fork(entry, [], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      HOST: API_HOST,
      PORT: String(API_PORT),
      // Local-first storage under the OS app-data dir; never egressed.
      MODELS_DIR: path.join(dataDir, 'models'),
      DB_PATH: path.join(dataDir, 'greenthumb.sqlite'),
      // No API_KEY locally: the gate is open on the user's own machine.
    },
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  })
  apiProcess.on('exit', (code) => {
    console.error(`[api] exited with code ${code}`)
  })
}

async function waitForHealth(timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(HEALTH_URL)
      if (res.ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('API did not become healthy in time')
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    title: 'greenthumb',
    backgroundColor: '#111318',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // Open external links in the browser, not inside the app window.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev && DEV_URL) {
    // The Vite dev server may not be listening yet (startup race) — retry the
    // load until it comes up instead of failing on ERR_CONNECTION_REFUSED.
    await loadUrlWithRetry(mainWindow, DEV_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    await mainWindow.loadFile(resource('web', 'index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

/** Retry loadURL until the dev server responds or we exhaust the timeout. */
async function loadUrlWithRetry(
  win: BrowserWindow,
  url: string,
  timeoutMs = 30_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (let attempt = 1; ; attempt++) {
    try {
      await win.loadURL(url)
      return
    } catch (err) {
      if (win.isDestroyed()) return
      if (Date.now() > deadline) {
        console.error(`Could not load ${url} after ${attempt} attempts:`, err)
        throw err
      }
      if (attempt === 1) console.error(`Waiting for dev server at ${url} …`)
      await new Promise((r) => setTimeout(r, 500))
    }
  }
}

app.whenReady().then(async () => {
  // In dev the API is started externally by `pnpm dev`; only boot it ourselves
  // when packaged (or run from a prepackaged build).
  if (!isDev) {
    startApi()
    try {
      await waitForHealth()
    } catch (err) {
      console.error(err)
    }
  }
  await createWindow().catch((err) => console.error('Failed to create window:', err))

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0)
      void createWindow().catch((err) => console.error('Failed to create window:', err))
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('quit', () => {
  apiProcess?.kill()
})
