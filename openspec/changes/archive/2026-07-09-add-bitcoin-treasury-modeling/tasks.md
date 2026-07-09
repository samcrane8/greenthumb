## 1. Formula primitives (core)

- [x] 1.1 Add `exp`, `ln`, `sqrt`, `pow`, `round`, `floor`, `clamp` to `evalCall` in `packages/core/src/formula.ts`, keeping each total (non-positive `ln`/`sqrt` → 0, NaN → 0) per the divide-by-zero convention
- [x] 1.2 Add `logistic(x, k, x0)` and `scurve(t, start, peak, ramp)` built-ins over `exp`
- [x] 1.3 Unit tests in `packages/core` covering each primitive, edge cases (domain guards, `pow` vs `^` parity, `logistic` centered at 0.5), and unknown-function still erroring
- [x] 1.4 Test that `prior(x) * exp(rate)` recursion computes and reports `converged === true`
- [x] 1.5 `pnpm --filter @greenthumb/core build` and `pnpm --filter @greenthumb/core test` green

## 2. Bitcoin treasury template (core)

- [x] 2.1 Add `bitcoin_treasury` to the `ModelType` union in `packages/core/src/types.ts`
- [x] 2.2 Implement `bitcoinTreasuryModel()` builder in `packages/core/src/templates.ts`: drivers (btc price, preferred issuance pace + ramp, dividend rate, common ATM, amplification cap, mNAV target) and formula items (btc_held, preferred_notional, cash, common_shares via `prior()` recursion; reserve, nav_to_common, nav_per_share, mnav, asst_price, implied_leverage, dividend obligation + coverage)
- [x] 2.3 Use `scurve`/`clamp`/`min` for issuance ramp and amplification cap; clamp price at `max(nav_per_share, 0) * mnav`
- [x] 2.4 Add a base scenario plus a drawdown/bear scenario overriding btc price and issuance
- [x] 2.5 Register the template in `TEMPLATES` (label + description) so it surfaces in API/MCP/web
- [x] 2.6 Tests: model validates with no errors, computes with `converged === true`, leverage > 1x when reserve rises, drawdown scenario diverges on `asst_price`

## 3. Chart & dashboard entities + operations (core)

- [x] 3.1 Add `Chart`, `ChartSeries`, `Dashboard`, `Widget` types and optional `charts?: Chart[]` / `dashboard?: Dashboard` fields on `Model` in `types.ts`
- [x] 3.2 Implement `getChartData(model, scenario, chartId)` in `packages/core/src/outputs.ts` (derive series, apply `index`-to-100)
- [x] 3.3 Add validate-on-write ops in `operations.ts`: `addChart`, `updateChart`, `removeChart`, `addWidget`, `updateWidget`, `removeWidget`, `reorderDashboard` — each returning `OpResult`
- [x] 3.4 Extend `validation.ts`: `DANGLING_CHART_REF`, `DANGLING_WIDGET_REF`, unique chart/widget ids; ensure optional fields stay backward compatible
- [x] 3.5 Export new types/ops/derivations from `packages/core/src/index.ts`
- [x] 3.6 Emit a curated default `dashboard` (tiles + projection table + 4 treasury charts) from the `bitcoin_treasury` builder; assert it validates
- [x] 3.7 Tests for chart-data derivation, indexing, reference validation, reorder-preserves-widgets, backward compat (model with no charts/dashboard loads + validates)

## 4. API adapter

- [x] 4.1 Add routes in `apps/api/start/routes.ts`: `POST/PATCH/DELETE /models/:id/charts[/:chartId]`, `GET /models/:id/charts/:chartId/data`, `POST/PATCH/DELETE /models/:id/dashboard/widgets[/:widgetId]`, `PUT /models/:id/dashboard/order`
- [x] 4.2 Wire them through `EditsController.#apply` (or a sibling) so `?preview=true`, `?override=true`, and the `{model,issues,ok}` / 422 contract are reused
- [x] 4.3 Add the chart-data read to a controller (compute for `?scenario=`)
- [x] 4.4 API tests: preview does not persist, dangling ref → 422, chart-data reflects scenario

## 5. MCP adapter

- [x] 5.1 Add MCP tools in `packages/mcp/src/index.ts` following the `call()` + `previewArg` pattern: `add_chart`, `list_charts`, `update_chart`, `remove_chart`, `get_chart_data`, `add_widget`, `update_widget`, `remove_widget`, `reorder_dashboard`
- [x] 5.2 Confirm `list_templates` / `create_model` surface `bitcoin_treasury` with no MCP changes
- [x] 5.3 Rebuild `packages/mcp` and smoke-test the stdio server (create model, add chart, list charts) against a running API

## 6. Web — chart rendering

- [x] 6.1 Add `recharts` to `apps/web/package.json`
- [x] 6.2 Add `api.ts` client methods for chart CRUD, chart-data, and dashboard ops
- [x] 6.3 Build `ChartView` mapping a `Chart` + computed data to line/area/bar/composed recharts primitives (dual-axis, indexed, reference lines)
- [x] 6.4 Render treasury charts (price, ASST-vs-BTC indexed, dividend coverage composed, implied leverage area) for the template model

## 7. Web — editable dashboard

- [x] 7.1 Build `DashboardView` that lays out `dashboard.widgets` on a fixed-column CSS grid, dispatching each kind to chart/stat/statement/note renderers
- [x] 7.2 Recompose `WorkspacePage` to host the dashboard; make the existing statement grid a `statement` widget; fall back to the statement view when a model has no dashboard
- [x] 7.3 Add an edit mode: add / remove / reorder / resize widgets, persisting through the dashboard API and refreshing model + issues
- [x] 7.4 Verify end to end: create a `bitcoin_treasury` model, see the default dashboard with charts, edit layout, reload persists

## 8. Verification & docs

- [x] 8.1 `pnpm typecheck` and all workspace tests green
- [x] 8.2 Run the `verify` skill: drive create-treasury-model → tune a driver → view charts → edit dashboard in the real app
- [x] 8.3 Update `docs/Roadmap.md` / template notes to describe the treasury template's first-order fidelity and the charts/dashboard capabilities
