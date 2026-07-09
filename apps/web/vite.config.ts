import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The API base URL. In dev we proxy /api → the AdonisJS server so the browser
// stays same-origin (no CORS). In the Electron shell and single-tenant cloud,
// the API is reachable at the same origin too, so app code always calls /api.
const API_TARGET = process.env.VITE_API_PROXY ?? 'http://localhost:3333'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
    },
  },
  // Electron loads the build from the filesystem, so use relative asset paths.
  base: './',
})
