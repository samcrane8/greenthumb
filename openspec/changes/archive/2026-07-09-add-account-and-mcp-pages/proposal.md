## Why

The web/desktop app has no place for a user to see who they are, tune display
preferences, or point the client at a hosted instance — and no in-app guidance
for the thing that makes greenthumb special: driving models from Claude via MCP.
Today MCP setup lives only in a code comment, so a new user has no path from
"the app is running" to "Claude Desktop / Codex is editing my model." This
change adds a bottom-left **account section** and two real pages (Account /
Settings and MCP connect), staying true to local-first: nothing requires login
when you run locally, but connecting to a cloud instance is a first-class,
optional step.

## What Changes

- Add a **client-side router** to `apps/web` so the app has addressable views:
  `/` (model workspace, unchanged), `/settings` (account + settings), `/mcp`
  (MCP connect guide). Browser back/forward and deep links work.
- Add an **account section pinned to the bottom-left of the sidebar** showing the
  current state:
  - **Local** (no `API_KEY` on the API): "Working locally" — no login required,
    everything works, Settings is fully available.
  - **Cloud**: enter a hosted instance URL + API key to connect; once connected,
    show the profile and a way to disconnect.
- Add a **Settings page** that manages:
  - **Display preferences** — theme (light/dark/system), currency, number format.
  - **Profile** — display name + email (local identity; no auth backend).
  - **Cloud connection** — instance URL + API key the client uses to reach a
    hosted API instead of the local one.
  - **MCP connection info** — the command/env needed to connect an MCP client,
    with copy buttons (shared with the MCP page).
- Persist settings **client-side** (localStorage), so they work identically in
  the browser and the Electron shell with no server round-trip and no egress in
  local mode. The cloud-connection target is necessarily client-side (it selects
  *which* API to talk to).
- Add an **MCP connect page** with copy-paste instructions for **Claude Desktop**
  (JSON `mcpServers` config) and **Codex** (CLI config), including the build step
  (`pnpm --filter @greenthumb/mcp build`), the `command`/`args`/`env`
  (`GREENTHUMB_API_URL`, `GREENTHUMB_API_KEY`), and a troubleshooting note.
- Add a thin, **read-only `GET /api/info`** endpoint reporting
  `{ mode: 'local' | 'cloud', requiresApiKey, version }` so the account section
  can render the correct Local/Cloud state and the MCP page can show the live API
  URL. No auth required (it only reports posture, no secrets).

**No change to `packages/core`.** This is the documented exception to
"engine-first": account identity, display preferences, cloud-connection target,
and setup documentation are **not** model-domain logic. The pure engine (domain
types, formulas, calc, validation) is untouched; the work lives in the adapters
(`apps/api` for the one read-only endpoint) and the UI (`apps/web`).

## Capabilities

### New Capabilities

- `web-navigation`: Client-side routing for the web/desktop app — addressable
  views (`/`, `/settings`, `/mcp`), sidebar navigation, deep links, and
  browser history.
- `account-settings`: The bottom-left account section and Settings page —
  local-first identity (no login required locally), optional cloud connection
  (instance URL + API key), display preferences, profile, and client-side
  persistence. Includes the read-only `GET /api/info` posture endpoint the panel
  reads.
- `mcp-setup-guide`: The in-app MCP connect page with copy-paste configuration
  for Claude Desktop and Codex, the build step, required env vars, and
  troubleshooting.

### Modified Capabilities

<!-- None. No existing spec-level behavior changes; the engine and existing API
     endpoints are untouched. -->

## Impact

- **`packages/core`** — none (intentionally; not model-domain logic).
- **`apps/api`** — one new read-only route `GET /api/info` (posture only, no
  secrets, no auth gate) via the existing controller pattern; no change to the
  model store or the `{ model, issues, ok }` mutation contract.
- **`apps/web`** — new routing dependency (lightweight router), a
  `settings`/account store (localStorage-backed) + `useSettings` hook, an account
  section component pinned to the sidebar bottom, `SettingsPage` and `McpPage`
  views, and theme application (light/dark/system). Existing model workspace
  moves under the `/` route unchanged.
- **`apps/desktop`** — no code change; inherits the same web bundle. Local mode
  stays open and login-free.
- **`packages/mcp`** — no code change; the setup guide documents the existing
  `command`/`args`/`env` contract already in `packages/mcp/src/index.ts`.

## Non-goals

- **No multi-user auth.** No user table, sessions, password/OAuth, or per-user
  model ownership. greenthumb stays single-tenant per deployment (PRD §9.6); "login"
  here means connecting the client to a hosted instance via its shared API key,
  plus a local display identity.
- **Not rebuilding Excel** (PRD §3) — this change adds no modeling surface; the
  engine, statements, and calc behavior are untouched.
- **No server-side settings sync or account service.** Preferences live
  client-side; there is no settings persistence API in this change.

## Integrity impact

None. This change does not touch the calc engine, validation, or the balance
(A = L + E) / tie-out invariants. No model mutation paths are added or altered,
so `validate-on-write` and the `?preview=true` review flow are unaffected. The
new `GET /api/info` endpoint is read-only and returns no model data.
