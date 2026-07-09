## 1. Treasury BTC-price chart (core)

- [x] 1.1 In `templates.ts` `attachTreasuryDashboard`, add a `line` chart with a `btc_price` series ("BTC price over time") and a dashboard widget for it
- [x] 1.2 Update the treasury test's dashboard assertion (4 → 5 charts) and add a check that a chart references `btc_price`
- [x] 1.3 `pnpm --filter @greenthumb/core build` + `test` green

## 2. Preview API

- [x] 2.1 Add `GET /api/commodities/:commodityId/:modelId/preview` to the models/commodities controller: build a default timeline (quarterly, ~24 periods, near-current start), apply query overrides (`periods`, `granularity`, `spot`, `band`, plus numeric params), call `generatePrice`, return `{ commodityId, modelId, periods, series, labels }`; 404 on unknown ids
- [x] 2.2 Register the route in `start/routes.ts`
- [x] 2.3 API tests: preview returns a finite series with labels; `spot` override pins period 0; unknown model → 404

## 3. Web — Commodities view

- [x] 3.1 Add `api.ts` methods: `commodities()` (GET /commodities) and `commodityPreview(commodityId, modelId, params?)` (GET preview)
- [x] 3.2 Build a small `PreviewChart` (recharts line, theme-aware) fed by `{ series, labels }` — reuse the styling from `ChartView`
- [x] 3.3 Build `CommoditiesPage`: list each commodity → its models → default params (key/value) + a `PreviewChart`; read-only w.r.t. the registry
- [x] 3.3a Add interactive parameter controls (spot, band, amplitude, cycleYears) seeded from `defaultParams` that re-fetch `commodityPreview` (debounced) and re-render the chart
- [x] 3.4 Add the `/commodities` route in `App.tsx` and a "Commodities" sidebar `NavLink` in `Sidebar.tsx`
- [x] 3.5 Typecheck + web tests green

## 4. Verification & docs

- [x] 4.1 `pnpm typecheck` and all workspace tests green; production `vite build` succeeds
- [x] 4.2 Drive the app (isolated store): create a treasury model → confirm the BTC-price chart renders on the dashboard; open /commodities → confirm the power-law preview renders
- [x] 4.3 Update `docs/Roadmap.md` to note the Commodities view and the treasury BTC-price chart
