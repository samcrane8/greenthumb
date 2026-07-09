## Why

We just added a commodity price-model registry (Bitcoin power law + oscillation)
and bound the treasury template's `btc_price` to it — but none of it is visible in
the app. There is no way to browse what commodities/models exist or see the shape a
price model produces, and a treasury model's dashboard shows the *derived* outputs
(ASST price, leverage, coverage) yet never plots the **BTC price path** that drives
them, even though it's now the empirically grounded power-law-plus-oscillation
series. This change surfaces both: a read-only **Commodities** view, and a **BTC
price over time** chart on the treasury dashboard.

Per the architecture rule, the underlying data already lives in `packages/core`
(the `COMMODITIES` registry and `generatePrice`); this change adds a thin API read
for previews and the web views over it — no new model logic.

## What Changes

- **Commodities view (web)** — a new read-only page at `/commodities`, reachable from
  the sidebar, listing each registered commodity, its price models, and their default
  parameters, with an **interactive preview chart** of the generated price path:
  parameter controls (spot, band, amplitude, cycle) re-render the chart so a user can
  explore how the power law and its halving-cycle oscillation respond. Read-only w.r.t.
  the registry — exploring the model never changes the stored defaults.
- **Preview API** — `GET /api/commodities/:commodityId/:modelId/preview` returns a
  generated sample series over a default (or query-overridable) timeline, so the web
  view can render the preview without importing the core runtime (the web imports
  types only).
- **BTC price chart on treasury models** — the `bitcoin_treasury` template's default
  dashboard gains a "BTC price" line chart plotting the `btc_price` driver over time
  (absolute price, showing the arc up through fair value and the cyclical reversal).
- Read-only throughout: the registry is not editable from the UI, and the preview
  endpoint is a pure read.

## Capabilities

### New Capabilities
- `commodities-view`: A read-only web view of the commodity registry — commodities,
  their price models, default parameters, and a preview of each model's price path —
  backed by a price-preview API read.

### Modified Capabilities
- `bitcoin-treasury-template`: The default dashboard includes a chart of the
  `btc_price` series over time.

## Impact

- **Core:** none (registry + `generatePrice` already exist; `listCommodities` already
  exported).
- **API:** one new route `GET /api/commodities/:commodityId/:modelId/preview` on the
  models/commodities controller, reusing `generatePrice`; returns `{ series, periods,
  labels }`. Unknown commodity/model → 404.
- **Web:** a `CommoditiesPage` + route + sidebar link + `api.ts` methods
  (`commodities`, `commodityPreview`); a small preview chart reusing the existing
  `recharts` setup. The treasury template change adds one chart to its default
  dashboard (a `templates.ts` edit already covered by core — surfaced here through the
  existing `ChartView`/`DashboardView`).
- **Integrity:** read-only; no mutations, no new validation. The new dashboard chart
  references the `btc_price` driver by name, which already resolves.

## Non-goals

- **Not rebuilding Excel** (PRD §3): a viewer, not an editor.
- **No editing of the commodity registry from the UI.** Commodities and their default
  params are defined in code; the view is read-only.
- **No new commodities.** Still Bitcoin only; the view simply renders whatever the
  registry contains.
- **No binding UI here.** Binding a model's driver to a commodity already exists via
  MCP/API; a driver-panel "price this driver" control is a separate future change.
- **No live market data** in the preview — it renders the deterministic model output.
