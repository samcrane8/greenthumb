## 1. Core — the pure renderer

- [ ] 1.1 Create `packages/core/src/export.ts` exporting `renderDashboardHtml(model, scenario, opts?): string` — pure, no I/O; computes the scenario once via `computeModel` and walks `model.dashboard.widgets`.
- [ ] 1.2 Render `stat` widgets (value + unit hint + horizon delta), reusing the same item/driver resolution and `formatNumber`-equivalent logic; render `statement` widgets via `getStatement` as HTML tables.
- [ ] 1.3 Add a pure SVG chart builder: map `getChartData(...)` → inline `<svg>` for `line`/`area`/`bar`/`composed`, with left/right axes and `index` rebasing; empty/degenerate series render a labeled empty plot, never throw. Colors follow the `dataviz` palette (load the `dataviz` skill first).
- [ ] 1.4 Add a minimal, safe markdown→HTML helper (headings, bold, italic, ordered/unordered lists, links, paragraphs) that **HTML-escapes first**; render `note` widgets with it.
- [ ] 1.5 Assemble a self-contained document: one inlined `<style>` (incl. `@media print`), no external assets/fonts/scripts; lay widgets out on the 12-col grid. No wall-clock timestamp in the body (determinism).
- [ ] 1.6 Export `renderDashboardHtml` from `packages/core/src/index.ts`.

## 2. Core tests

- [ ] 2.1 Structural tests on a treasury model: the HTML contains a stat tile per stat widget, an `<svg>` per chart widget, a table per statement widget, and note text; no dangling refs; no `<script>` / external `http` asset.
- [ ] 2.2 Determinism: two renders of the same model+scenario are byte-identical; two different scenarios produce different chart/value content.
- [ ] 2.3 Chart SVG: a dual-axis indexed chart renders both axes and a series rebased to 100 at period 0; line/area/bar/composed each emit their mark.
- [ ] 2.4 Markdown/escaping: a note with headings/list/bold renders structured elements; a note with raw `<b>`/angle brackets is escaped (no injected markup).
- [ ] 2.5 Rebuild core (`pnpm --filter @greenthumb/core build`) and run `pnpm --filter @greenthumb/core test`.

## 3. Adapters

- [ ] 3.1 API: add `GET /models/:id/export?scenario=&format=html` → `renderDashboardHtml`, respond `text/html` with a `Content-Disposition` attachment filename; unknown `format` → 400; unknown model/scenario → 404.
- [ ] 3.2 API functional test: export returns an HTML document for a treasury model; a bad format → 400.
- [ ] 3.3 MCP: add an `export_dashboard(modelId, scenario?)` tool that returns the HTML string; document it lists the dashboard's exhibits + narrative.

## 4. Verify

- [ ] 4.1 `pnpm typecheck` across workspaces.
- [ ] 4.2 Run core tests and `apps/api` functional tests.
- [ ] 4.3 Live: create a treasury model, `GET /models/:id/export?format=html`, save the file, and confirm it opens standalone (charts as SVG, tiles, KPI table, notes) with no network requests; print-to-PDF lays out cleanly.
