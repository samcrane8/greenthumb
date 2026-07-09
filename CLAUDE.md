# CLAUDE.md — working in this repo

greenthumb is a local-first financial modeling engine. See `README.md` for the
full picture and `docs/Financial-Modeling-Service-PRD.md` for the product spec.

## Feature development is spec-driven — use OpenSpec by default

**OpenSpec is the default system for developing features in this repo.** Do NOT
jump straight to writing code for a new feature, behavior change, or non-trivial
refactor. Capture the intent as a spec-driven change proposal first, get it
right, then implement against it. Specs live in `openspec/` and persist context
across sessions.

The workflow (these are `/opsx:` slash commands run in chat):

1. **`/opsx:explore "<fuzzy idea>"`** — optional. A no-stakes thinking partner to
   sharpen a vague idea into a concrete plan before any artifact exists.
2. **`/opsx:propose "<change>"`** — creates a change proposal (`proposal.md`,
   spec deltas under `specs/`, `design.md`, `tasks.md`). This is the starting
   point for essentially all feature work.
3. **`/opsx:apply`** — implement the tasks from the approved proposal.
4. **`/opsx:sync`** — reconcile specs with what was actually built.
5. **`/opsx:archive`** — finalize and fold the change into the main specs.

Project context and per-artifact rules for OpenSpec live in
`openspec/config.yaml` (already populated with our stack, the single-source-of-
truth rule, and conventions) — keep it current as the architecture evolves.

**When to skip it:** trivial one-line fixes, dependency bumps, doc typos, or
build/tooling config. Anything that changes model behavior, the engine, the API
surface, the MCP tools, or the UI's capabilities goes through OpenSpec. When a
proposal drives the work, the architecture rule below still governs *how* the
tasks are ordered (engine first, adapters second).

## The one rule that shapes everything

**`packages/core` is the single source of truth.** It is pure TypeScript with no
I/O — domain types, the calc engine, validation, templates. The API, the MCP
server, and (indirectly) the UI are all thin adapters over it. When you add a
capability, add it to the core operation layer first, then expose it through the
adapters — never duplicate model logic in an adapter.

- Domain types: `packages/core/src/types.ts`
- Formula language (parser + evaluator): `packages/core/src/formula.ts`
- Calc engine (dependency order + iterative solver): `packages/core/src/engine.ts`
- Validate-on-write operations: `packages/core/src/operations.ts`
- Integrity checks: `packages/core/src/validation.ts`

Every mutation validates before commit. The API and MCP both return
`{ model, issues, ok }` and support `?preview=true` — keep that contract.

## Monorepo

pnpm workspaces. `packages/*` build with `tsc`; `apps/*` are AdonisJS (api),
Vite/React (web), Electron (desktop). The web app imports **types only** from
core (so it needs no core runtime build), but the **API imports core at runtime**
— build core before running the API: `pnpm --filter @greenthumb/core build`.

## Common tasks

```bash
pnpm dev                                  # web stack: API :3333 + Vite :5173
pnpm dev:desktop                          # Electron + API + web
pnpm --filter @greenthumb/core test         # engine tests
pnpm --filter @greenthumb/core build        # rebuild engine after core changes
pnpm typecheck                            # all workspaces
```

The AdonisJS dev server is `node ace serve` (started for you by `pnpm dev`).
It does not run from `node bin/server.js` without a build — use `node ace serve`.

## Conventions

- Costs are negative (sign convention); balance sheet must satisfy A = L + E —
  `validation.ts` enforces it when the model has BS items.
- Formula references are by item/driver **name** (not cell coords); items win
  name collisions with drivers.
- Add a new template in `packages/core/src/templates.ts` and register it in
  `TEMPLATES` so it appears in the UI picker and the MCP `list_templates`.
- Don't log to stdout in the MCP server — it corrupts the stdio channel; use
  `console.error`.
