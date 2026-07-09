## Context

The web app imports **types only** from `@greenthumb/core` (so it needs no core
runtime build); all computation happens behind the API. The commodity registry
(`COMMODITIES`, `listCommodities`, `generatePrice`) lives in core and is already
exposed for metadata via `GET /api/commodities`. Charts in the app are rendered by
the existing `ChartView` (recharts, lazy-loaded) driven by `ChartData` rows; the
treasury dashboard is a `Dashboard` of widgets, and `btc_price` is now a driver
(commodity-priced). This change is purely presentational: surface the registry and
plot the price path.

## Goals / Non-Goals

**Goals:**
- A read-only Commodities page showing commodities → models → default params, each
  with a visual preview of the price path.
- A BTC-price-over-time chart on treasury dashboards.

**Non-Goals:** editing the registry, binding UI, new commodities, live data (see
proposal).

## Decisions

### D1 — Preview via a tiny API read, not client-side generation
The web can't run `generatePrice` (types-only import), so add
`GET /api/commodities/:commodityId/:modelId/preview` that builds a default timeline
(quarterly, ~24 periods, near-current start), applies any query-param overrides
(`periods`, `granularity`, `spot`, `band`, …), calls `generatePrice`, and returns
`{ commodityId, modelId, periods, series, labels }`. **Why:** keeps the one-engine
rule (generation stays in core), avoids shipping core to the browser, and mirrors how
`chartData`/`statement` already work. Unknown ids → 404. **Alternative rejected:**
duplicating the power law in TS in the web app — violates single-source-of-truth.

### D2 — Reuse recharts for the preview; don't couple to a model's ChartView
`ChartView` is model/scenario-bound (it fetches `/models/:id/charts/:chartId/data`).
The commodities preview isn't tied to a model, so render it with a small dedicated
line chart component fed by the preview endpoint's `series` + `labels`. **Why:** the
preview is model-independent; forcing it through the model-chart path would need a
fake model. Keep a lean `PreviewChart` that shares the recharts + theming already in
`ChartView`. **Trade-off:** a little chart code duplication, justified by decoupling.

### D2a — The preview is interactive (resolved open question 1)
Each price model renders parameter controls (sliders/inputs) for its key params —
for the Bitcoin power law: `spot`, `band`, `amplitude`, and `cycleYears`. Adjusting a
control re-requests the preview endpoint with the overridden params (debounced) and
re-renders the chart, so a user can *explore* how the power law and its oscillation
respond. This stays **read-only w.r.t. the registry** — it explores the model, it does
not change the stored defaults. The preview endpoint already accepts these overrides
(D1), so this is a pure web addition. Controls seed from the model's `defaultParams`.

### D3 — Commodities page is a top-level route with a sidebar link
Add `/commodities` as a sibling of `/` (Workspace) in the router, with a sidebar
`NavLink` ("Commodities"). List each commodity as a card; under it, each model with
its default params (as a small key/value table) and a `PreviewChart`. **Why:** matches
the existing addressable-view + sidebar navigation pattern (web-navigation capability);
it's reference material, not workspace-scoped, so a top-level route fits better than a
settings sub-page. **Alternative considered:** a settings sub-page — rejected; this is
domain reference, not configuration.

### D4 — BTC price chart is a default-dashboard addition on the treasury template
Add one `Chart` (`kind: line`, series `btc_price`) to the treasury builder's default
dashboard, plus a widget for it, so new treasury models plot BTC price over time out
of the box. This is **additive** — the existing indexed ASST-vs-BTC chart stays (they
answer different questions: absolute price level vs. relative leverage). It renders through the existing `ChartView`/`DashboardView` with no web
changes beyond what those already do. **Why:** `btc_price` is a driver and chart series
resolve drivers by name, so `getChartData` already returns it. This modifies the
`bitcoin-treasury-template` capability's default-dashboard requirement. **Note:** this
touches `templates.ts` (core), but it's presentational (dashboard content), so it's
grouped with this visualization change rather than the pricing change.

## Risks / Trade-offs

- **Preview default timeline may not match a user's actual model horizon** → it's a
  *preview* of the model shape, not a model; label it as such and allow query overrides.
- **Adding a chart shifts the treasury dashboard layout** → append the BTC-price widget
  in a sensible grid slot; existing widgets keep their positions (additive), and the
  dashboard is user-editable anyway.
- **New route/link must not disturb existing nav** → additive router entry + one
  sidebar link; back-compat redirects untouched.

## Migration Plan

Additive and backward compatible. New API read + web route only; no schema or stored
data changes. Existing treasury models keep their stored dashboard; only newly created
treasury models get the BTC-price chart (consistent with how template changes have
landed). Rollback = revert code.

## Open Questions

_Both resolved (see D2a, D4):_
- **Interactive preview** → yes; the Commodities view has parameter controls that
  re-fetch the preview (spot/band/amplitude/cycleYears), read-only w.r.t. the registry.
- **Keep both treasury charts** → yes; the existing indexed ASST-vs-BTC chart stays,
  and the new absolute BTC-price chart is added alongside it (absolute level vs.
  relative leverage answer different questions).
