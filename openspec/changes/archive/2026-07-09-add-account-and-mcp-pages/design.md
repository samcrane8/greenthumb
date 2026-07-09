## Context

`apps/web` is a single-view React 19 + Vite + shadcn/Tailwind v4 app. `App.tsx`
renders one screen: a fixed sidebar (brand, model list, "New from template") and
a main workspace. There is **no router**, no notion of an account, and no
persisted user preferences. Auth is single-tenant (PRD §9.6): the API's
`api_key_middleware.ts` is a no-op when `API_KEY` is unset (local desktop) and a
shared-secret bearer gate when set (cloud). The web client already reads an
optional `VITE_API_KEY` / `VITE_API_URL` at build time (`apps/web/src/lib/api.ts`).
MCP setup exists only as a comment in `packages/mcp/src/index.ts`.

The engine (`packages/core`) is the single source of truth and is pure (no I/O).
Account identity, display preferences, the cloud-connection target, and setup
docs are **not** model-domain logic, so — unusually for this repo — this change
does not touch core. It lives entirely in the adapters (`apps/api`) and UI
(`apps/web`).

## Goals / Non-Goals

**Goals:**
- Local-first: running locally requires **no login**; every feature works and the
  account section shows "Working locally."
- A bottom-left account section that reflects Local vs Cloud posture and links to
  Settings and MCP.
- Real, addressable pages for Settings and MCP via a lightweight router; `/`
  stays the model workspace, unchanged in behavior.
- Optional cloud connection: point the client at a hosted instance by URL + API
  key, persisted client-side, with connect/disconnect.
- An in-app MCP guide with copy-paste config for Claude Desktop and Codex.

**Non-Goals:**
- No multi-user auth, user table, sessions, or OAuth (see proposal Non-goals).
- No server-side settings persistence or sync — preferences are client-side only.
- No change to the engine, model store, validation, or the mutation contract.

## Decisions

### 1. Client-side routing via `react-router-dom`
Introduce `react-router-dom` (`createBrowserRouter`). Top-level routes: `/`
(workspace) and `/settings`. `/settings` is itself a **nested layout** with its
own left sub-menu; each concern is a child route: `/settings/preferences`,
`/settings/profile`, `/settings/cloud`, `/settings/mcp`. `/settings` index
redirects to `/settings/preferences`, and the legacy `/mcp` redirects to
`/settings/mcp`. The sidebar (brand, model list, templates, account section)
becomes a persistent layout shell; the main pane is the routed outlet, and the
settings content pane is a second nested outlet.

- **Why**: The user explicitly chose "real pages." react-router is the de-facto
  standard, tiny, and gives deep links + browser history for free.
- **Alternatives**: (a) Hand-rolled `useState` view switch — no URLs, no history,
  regresses as pages grow. (b) TanStack Router — more powerful typed routing but
  heavier and unnecessary here. (c) Hash router — uglier URLs; browser history
  works fine for our SPA served by Vite/Electron, so `createBrowserRouter` wins.
- **Electron note**: Electron loads the built `index.html`; `BrowserRouter` works
  because navigation is in-app (no server round-trip for routes). The existing
  Vite dev server already serves the SPA at `/`.

### 2. Settings persisted client-side in `localStorage`
A single `settings` object `{ profile, display, cloud }` persisted under one
localStorage key, exposed via a `useSettings()` hook + small store (context or a
tiny zustand-free module with `useSyncExternalStore`).

- **Why**: Local-first with zero egress in local mode; identical behavior in
  browser and Electron; no new server surface. The cloud target *must* be
  client-side — it selects which API the client talks to, so it cannot live on
  that API.
- **Alternatives**: (a) Server-side settings store (SQLite/JSON) — adds an API
  surface, breaks "no egress locally," and can't hold the cloud target anyway.
  (b) Electron `electron-store` — wouldn't work in the browser build; localStorage
  is the shared lowest common denominator.
- **Trade-off**: Settings are per-browser/per-profile, not synced across devices.
  Acceptable and consistent with local-first; called out as a Non-goal.

### 3. Cloud connection overrides the API base at runtime
`lib/api.ts` currently reads `BASE`/`API_KEY` from `import.meta.env` at build
time. Refactor so the request layer reads the effective base URL + key from the
settings store at call time: when a cloud connection is set, use its URL + key;
otherwise fall back to the build-time env (local `/api`). "Connect" validates by
calling `GET /api/info` (then `/health`) against the entered URL with the key.

- **Why**: Lets a single built bundle talk to local *or* a chosen cloud instance
  without rebuilding; makes the account state observable and testable.
- **Alternatives**: Build-time-only config (status quo) — can't switch instances
  from the UI, which is the whole point of "cloud connect."
- **Trade-off**: The API key lives in localStorage (client-side). This matches the
  existing `VITE_API_KEY` posture (already client-visible) and the single-tenant
  shared-secret model; documented, not a regression.

### 4. `GET /api/info` posture endpoint (only backend change)
Add a read-only route returning `{ mode: 'local' | 'cloud', requiresApiKey,
version }`, derived from whether `env.API_KEY` is set. It is **ungated** (declared
outside the `apiKey()` group, like `/health`) and returns **no secrets** — only
whether a key is required, so an unauthenticated client can render the right
state and the MCP page can confirm reachability.

- **Why**: The account section needs to know if the target API is open (local) or
  gated (cloud) to show "Working locally" vs a connect prompt, and to give a clear
  "this instance needs a key" message. Mirrors the existing `/health` pattern.
- **Alternatives**: Infer posture purely client-side (401 probing) — brittle and
  produces confusing flows; a tiny explicit endpoint is clearer and testable.
- **Security**: Reports posture only. `requiresApiKey: true` leaks nothing an
  attacker couldn't learn by getting a 401.

### 5. MCP guide is data-driven, shared with Settings
The MCP config (build command, `command`/`args`/`env` with `GREENTHUMB_API_URL` /
`GREENTHUMB_API_KEY`) is defined once and rendered on both the `/mcp` page (full
Claude Desktop + Codex walkthrough) and the Settings "MCP connection info" card
(compact). The live API URL comes from the effective connection; the API key
field is shown as a placeholder the user substitutes (never auto-filled from a
real secret in copyable text unless the user opts in).

- **Why**: One source for the setup snippet avoids drift; matches the repo's
  single-source-of-truth ethos at the UI layer.

### 6. Theme application (light/dark/system)
Display preference `theme` toggles a `class="dark"` (or `data-theme`) on the root
per Tailwind v4 dark-mode convention; `system` follows `prefers-color-scheme`.
Applied on load and on change from the settings store.

## Risks / Trade-offs

- **API key stored in localStorage** → Mitigation: matches the existing
  single-tenant shared-secret model and the already-client-visible `VITE_API_KEY`;
  documented in Settings; disconnect clears it. Not introducing per-user secrets.
- **Router refactor could disturb the working `/` view** → Mitigation: move the
  current `App.tsx` body verbatim into a `WorkspacePage` mounted at `/`; the
  sidebar becomes a layout shell. No workspace behavior changes; covered by a
  smoke test that `/` still renders the model list.
- **Effective-base-URL refactor in `lib/api.ts` touches every request** →
  Mitigation: centralize in the single `req()` helper (one call site); add a unit
  test that the resolver prefers cloud settings over env and falls back correctly.
- **`react-router-dom` is a new runtime dependency in a types-only-from-core app**
  → Mitigation: it's a web-only dep (`apps/web`), doesn't touch core's
  types-only import; standard, well-maintained.
- **Electron deep-link/refresh on a sub-route** → Mitigation: `createBrowserRouter`
  with in-app navigation; if a hard refresh on `/settings` under `file://` ever
  misbehaves, fall back to `createHashRouter` (isolated one-line change).

## Migration Plan

1. Add `react-router-dom` to `apps/web`; wrap the app in the router; move the
   existing workspace into `WorkspacePage` at `/`. Verify `/` is unchanged.
2. Add `GET /api/info` to the API (ungated) + a controller test for local vs
   cloud posture.
3. Add the settings store + `useSettings` hook (localStorage) and theme
   application.
4. Refactor `lib/api.ts` to resolve the effective base URL + key from settings,
   falling back to env.
5. Build the account section (sidebar bottom), `SettingsPage`, and `McpPage`.
6. Typecheck all workspaces; smoke-test local mode (no login) and a simulated
   cloud connect.

**Rollback**: Feature is additive and UI-scoped. Revert the `apps/web` commits
and the single `apps/api` route; no data migration, no engine change, nothing to
undo in stored models.

## Open Questions

- Should the MCP page's copy snippet auto-insert the connected cloud API key, or
  always show a `<your-api-key>` placeholder? Default: placeholder, with an opt-in
  "use my connected key" toggle — resolve during implementation.
- Exact shape of `version` in `/api/info` (package version vs build hash) — default
  to the API package version for now.
