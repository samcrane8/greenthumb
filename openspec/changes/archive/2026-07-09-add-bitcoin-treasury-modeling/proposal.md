## Why

greenthumb can model recurring-revenue businesses (the `saas` template) but cannot
express a **Bitcoin treasury company** like Strategy (MSTR) or Strive (ASST) — a
firm whose equity is a *levered residual claim* on a crypto reserve funded by
perpetual preferred stock. The reference model in `docs/references/asst_model.tsx`
shows what's needed and what's missing: a treasury-specific model structure,
formula primitives for S-curve capital raises and mean-reversion (no `exp`/`ln`
today), interactive **charts** (none exist in the product), and a **configurable
dashboard** to lay out tiles, charts, and the projection table (the web view is
hardcoded). This change closes those four gaps so an analyst — or Claude via MCP —
can build and explore an MSTR-style model end to end.

Per the architecture rule, everything lands in `packages/core` first (types,
formula primitives, template, chart/dashboard entities + validate-on-write ops),
then the API and MCP adapters expose it, then the web app renders it. No model
logic is duplicated in an adapter.

## What Changes

- **New `bitcoin_treasury` template** — a builder producing the levered-residual
  structure: BTC reserve (held × price), perpetual-preferred notional and its
  dividend obligation, cash buffer, common shares, NAV-to-common
  (`BTC + cash + other − preferred`), NAV/share, mNAV (premium/discount),
  implied leverage, and treasury BTC purchases from capital raises. Registered in
  `TEMPLATES` so it appears in the UI picker, `GET /templates`, and MCP
  `list_templates` automatically.
- **New formula primitives** in the formula language: `exp`, `ln`, `sqrt`,
  `pow`, `round`, `floor`, `clamp`, and a `logistic`/`scurve` helper — enough to
  express S-curve issuance ramps and mNAV mean-reversion declaratively instead of
  in imperative React.
- **First-class charts** — a `Chart` entity persisted on the model (series
  references, chart type: line/area/composed/bar, axes, indexing), a compute
  endpoint that returns chart-ready series for a scenario, MCP tools to
  create/list/update charts, and a chart-rendering component in the web app (adds
  a charting dependency).
- **Editable dashboards** — a `Dashboard` entity (ordered widgets referencing
  charts, stat tiles, statements, or notes), validate-on-write ops to
  add/update/remove/reorder widgets, adapter routes + MCP tools, and a web
  dashboard view that renders and edits the layout (replacing the hardcoded
  `WorkspacePage` composition).
- All new mutations return `{ model, issues, ok }` and honor `?preview=true`,
  preserving the accept/reject contract.

## Capabilities

### New Capabilities
- `bitcoin-treasury-template`: A registered template that scaffolds a Bitcoin
  treasury company as a levered residual claim (reserve, preferred, dividend
  coverage, mNAV, implied leverage) with sensible default drivers and scenarios.
- `formula-primitives`: Additional math functions in the formula language
  (`exp`, `ln`, `sqrt`, `pow`, `round`, `floor`, `clamp`, `logistic`/`scurve`)
  that make S-curves and mean-reversion expressible in-engine.
- `model-charts`: Persisted chart definitions on a model plus a compute path that
  turns them into scenario-specific series, exposed through the API, MCP, and a
  web chart renderer.
- `dashboards`: A persisted, editable dashboard of ordered widgets (charts, stat
  tiles, statements, notes) with validate-on-write layout operations and a web
  editor.

### Modified Capabilities
<!-- None. The existing specs (account-settings, mcp-setup-guide, web-navigation)
     are unaffected at the requirement level; the dashboard view is additive. -->

## Impact

- **Core (first):** `types.ts` (`ModelType` gains `bitcoin_treasury`; new `Chart`,
  `Dashboard`, `Widget` types on `Model`), `formula.ts` (new built-ins),
  `templates.ts` (builder + registration), `operations.ts` (chart/dashboard ops),
  `validation.ts` (chart series-ref and widget-ref integrity), `outputs.ts`
  (chart series assembly), `index.ts` (exports).
- **API:** new routes under `/models/:id/charts` and `/models/:id/dashboard`
  (+ a chart-compute read), reusing `EditsController.#apply`'s preview/override
  machinery; charts/dashboard persist inside the existing model JSON store.
- **MCP:** new tools (`add_chart`, `list_charts`, `update_chart`, chart-data read,
  dashboard layout ops) following the existing `call()` + `previewArg` pattern.
- **Web:** a charting library dependency and new chart + dashboard components;
  `WorkspacePage` recomposed around the dashboard entity.
- **Integrity:** new validation ensures every chart series and every widget
  reference resolves to a real item/driver/chart; the `bitcoin_treasury` template
  has no balance-sheet items, so `A = L + E` is not triggered — but if BS items are
  later added, existing enforcement still applies. Costs-negative and
  name-collision rules are unchanged.

## Non-goals

- **Not rebuilding Excel** (PRD §3): no free-form cell grid, no arbitrary
  per-cell formatting, no pivot tables. Charts and dashboards reference the
  model's semantic series — they do not become a second modeling surface.
- **No live in-browser calc engine.** Driver edits still round-trip through the
  API to the one core engine; charts recompute from that result.
- **No new market-data feeds.** BTC price, ETF flows, and cycle assumptions are
  user-supplied drivers/scenarios, not live external data.
- **No drag-and-drop canvas** in this change — dashboard editing is add / remove /
  reorder / resize of widgets in a grid, not a free-form design canvas.
- **No sensitivity-sweep engine.** Scenarios remain the exploration mechanism;
  slider-driven sweeps are out of scope here.
