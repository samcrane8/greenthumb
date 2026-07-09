# greenthumb

A **local-first financial modeling engine** with two coordinated front ends — a
human UI and an MCP server for Claude — over **one core engine as the single
source of truth**. Models are typed, semantic object graphs (drivers, line
items, time-aware formulas, scenarios), not opaque grids of cells, so they are
legible to a human, safe to edit programmatically, and reasoned-about by an AI.

Ships two ways from the same codebase:

- **Desktop app** (Electron) — local-first; all data stays on the machine.
- **Web app** (subscribable service) — single-tenant per deployment.

See [`docs/Financial-Modeling-Service-PRD.md`](docs/Financial-Modeling-Service-PRD.md)
for the full product spec.

## Architecture

```
        React + shadcn UI            Claude (MCP client)
        (apps/web)                   (packages/mcp)
              │  HTTP /api                 │  stdio → HTTP /api
              └───────────────┬───────────┘
                     AdonisJS API  (apps/api)
                     • model JSON store (diffable, git-versionable)
                     • SQLite via Lucid (actuals, snapshots)
                     • single-tenant API-key gate
                              │
                     Core engine  (packages/core)
                     • typed domain graph  • dependency-ordered recompute
                     • iterative solver (intentional circularity)
                     • validate-on-write   • templates · statements

  Electron shell (apps/desktop) forks the SAME AdonisJS API on localhost and
  loads the built React UI — one code path for local and cloud.
```

The engine (`@greenthumb/core`) is **pure TypeScript, no I/O**. Every adapter — the
UI via the API, and Claude via MCP — operates through the same types and the same
validated operations, so no one (human or AI) can leave a model in a broken state.

## Workspace layout

| Package | What it is |
| --- | --- |
| `packages/core` | The financial model engine. Domain types, calc graph, iterative solver, validation, templates. |
| `packages/mcp` | MCP server (stdio) exposing the engine to Claude via the local API. |
| `apps/api` | AdonisJS backend. HTTP surface over the engine + persistence + single-tenant auth. |
| `apps/web` | React + Vite + shadcn/ui workspace (model grid, drivers, scenarios). |
| `apps/desktop` | Electron shell that boots the API locally and loads the web UI. |

## Getting started

```bash
pnpm install
pnpm --filter @greenthumb/core build   # the engine other packages depend on

# Run the web stack (API + Vite dev server):
pnpm dev                              # http://localhost:5173  (API on :3333)

# Or run the full desktop app in dev (API + web + Electron):
pnpm dev:desktop
```

Create a model from the sidebar (e.g. **SaaS / ARR**) and edit driver
assumptions — the statement grid recomputes through the engine.

## Connecting Claude (MCP)

Build the server, then point an MCP client at it while the API is running:

```bash
pnpm --filter @greenthumb/mcp build
```

```json
{
  "mcpServers": {
    "greenthumb": {
      "command": "node",
      "args": ["<repo>/packages/mcp/dist/index.js"],
      "env": { "GREENTHUMB_API_URL": "http://localhost:3333" }
    }
  }
}
```

Claude can then `create_model`, `add_line_item`, `set_formula`, `set_assumption`,
`get_output`, `validate_model`, and more — operating on the **same live model**
the UI shows. Every mutating tool supports `preview: true` for the accept/reject
review flow.

## Persistence & privacy

- Models are stored as **diffable JSON files** (`storage/models/*.json` locally;
  `MODELS_DIR` in the cloud) — git-versionable, auditable, local-first.
- **SQLite** (via Lucid) holds bulky actuals time-series and version snapshots.
- **Local-first by default**: the desktop app runs the API on localhost with data
  under the OS app-data dir — nothing is egressed. Each cloud instance is
  **single-tenant**, gated by a shared `API_KEY`.

## Scripts

| Command | Effect |
| --- | --- |
| `pnpm dev` | API + web dev server (web stack). |
| `pnpm dev:desktop` | API + web + Electron (desktop). |
| `pnpm build` | Build all packages and apps. |
| `pnpm typecheck` | Typecheck every workspace. |
| `pnpm --filter @greenthumb/core test` | Engine unit tests. |
| `pnpm --filter @greenthumb/desktop dist` | Package the desktop app (see note). |

> **Packaging note:** the desktop `dist` bundles the built API as a resource and
> forks it via Electron-as-Node. `better-sqlite3` must be rebuilt against
> Electron's ABI (`@electron/rebuild` / electron-builder `install-app-deps`)
> before a production package — see `apps/desktop/electron-builder.yml`.
