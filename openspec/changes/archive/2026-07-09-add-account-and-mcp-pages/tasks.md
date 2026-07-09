## 1. Engine (packages/core)

- [x] 1.1 No change. Account identity, display preferences, cloud-connection
  target, and MCP setup docs are not model-domain logic; the pure engine
  (types, formulas, calc, validation) stays untouched. Confirm no core edit is
  introduced by this change.

## 2. API adapter (apps/api) — posture endpoint

- [x] 2.1 Add a read-only `GET /api/info` route, declared OUTSIDE the
  `apiKey()`-gated group (alongside `/health` in `start/routes.ts`) so it is
  reachable without a bearer token.
- [x] 2.2 Return `{ mode, requiresApiKey, version }` derived from `env.get('API_KEY')`:
  `mode` = `'cloud'` when set else `'local'`, `requiresApiKey` = `!!API_KEY`,
  `version` from the API package version. Return NO secrets.
- [x] 2.3 Add a controller/functional test: with `API_KEY` unset → `mode:'local'`,
  `requiresApiKey:false`; with `API_KEY` set and no bearer token → `200` with
  `mode:'cloud'`, `requiresApiKey:true`, and the key absent from the body.
- [x] 2.4 Run `pnpm typecheck` and the API tests; verify `/api/info` responds in
  both postures.

## 3. Web routing (apps/web) — addressable pages

- [x] 3.1 Add `react-router-dom` to `apps/web` dependencies.
- [x] 3.2 Introduce a router (`createBrowserRouter`) with a layout shell that
  keeps the sidebar persistent and renders the routed page in the main pane.
- [x] 3.3 Move the current `App.tsx` workspace body verbatim into a
  `WorkspacePage` mounted at `/`; confirm model list, create, edit, validate,
  and statement views are unchanged.
- [x] 3.4 Add empty-shell routes `/settings` and `/mcp` and a smoke test/manual
  check that deep-linking and browser back/forward work.

## 4. Settings store & theme (apps/web)

- [x] 4.1 Define the settings shape `{ profile, display, cloud }` and a
  localStorage-backed store exposed via a `useSettings()` hook
  (e.g. `useSyncExternalStore`).
- [x] 4.2 Apply theme (light/dark/system) on load and on change; `system` follows
  `prefers-color-scheme` per Tailwind v4 dark-mode convention.
- [x] 4.3 Refactor `lib/api.ts` `req()` to resolve the effective base URL + key
  from the settings store at call time, falling back to the build-time env
  (local `/api`) when no cloud connection is set.
- [x] 4.4 Add a unit test for the base-URL/key resolver: cloud connection wins;
  falls back to env when disconnected.

## 5. Account section & Settings page (apps/web)

- [x] 5.1 Fetch `GET /api/info` for the effective target and expose Local vs
  Cloud posture to the UI.
- [x] 5.2 Build the account section pinned to the sidebar bottom-left: "Working
  locally" (no login) in local mode; profile summary + connection state in cloud
  mode; activating it navigates to `/settings`.
- [x] 5.3 Build the Settings page with cards for: Display preferences (theme,
  currency, number format), Profile (display name, email), Cloud connection
  (URL + API key with Connect/Disconnect), and an MCP connection-info card.
- [x] 5.4 Implement Connect: validate the entered URL + key against `GET /api/info`
  (then `/health`), persist on success, surface an error and do not persist on
  failure; Disconnect clears the stored URL + key and returns to local.

## 6. MCP connect page (apps/web)

- [x] 6.1 Define the MCP config data once (build command, `command`/`args`/`env`
  with `GREENTHUMB_API_URL`/`GREENTHUMB_API_KEY`) and share it between the `/mcp`
  page and the Settings MCP card.
- [x] 6.2 Build the `/mcp` page: prerequisites (build step + server command),
  the effective `GREENTHUMB_API_URL`, and a note that `GREENTHUMB_API_KEY` is only
  needed for a gated instance.
- [x] 6.3 Add the Claude Desktop section: `mcpServers` JSON snippet with a copy
  control that copies a valid entry.
- [x] 6.4 Add the Codex section: Codex MCP config snippet with a copy control.
- [x] 6.5 Add a troubleshooting section covering: API not running, MCP server
  not built (`dist` missing), and API-key mismatch on a gated instance.

## 8. Nested settings routes (apps/web)

- [x] 8.1 Make `/settings` a nested layout (`SettingsLayout`) with its own
  left sub-menu (Preferences, Profile, Cloud connection, Connect MCP) and a
  nested `<Outlet />`; `/settings` index redirects to `/settings/preferences`.
- [x] 8.2 Split each concern into its own addressable page:
  `/settings/preferences`, `/settings/profile`, `/settings/cloud`,
  `/settings/mcp` (the MCP guide moves under settings).
- [x] 8.3 Point the sidebar "Connect MCP" link at `/settings/mcp`, mark the
  account section active on any `/settings` sub-route, and redirect the legacy
  `/mcp` path to `/settings/mcp`.
- [x] 8.4 Typecheck, build, and verify each nested route + redirect serves.

## 7. Verification

- [x] 7.1 `pnpm typecheck` across all workspaces passes.
- [x] 7.2 Manual smoke test — local mode: no login required, all pages work,
  settings persist across reload, no egress on settings changes.
- [x] 7.3 Manual smoke test — cloud connect: connect to a gated instance (real or
  simulated), requests carry the bearer token, disconnect returns to local.
- [x] 7.4 Verify copy controls on the MCP page produce valid Claude Desktop and
  Codex configurations.
