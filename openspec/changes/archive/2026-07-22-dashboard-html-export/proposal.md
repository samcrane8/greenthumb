## Why

Per the [2026-07-22 assessment](../../../docs/assessments/2026-07-22-analysis-engine-assessment.md)
and Roadmap §7.3, there is **no export call on the tool surface**: `get_output`
returns statements and `get_chart_data` returns chart rows — *data*, not a rendered,
shareable document. So an agent can't produce the "generate in greenthumb, look at
it, export as HTML/PDF including the narrative" deliverable the analysis workflow
asks for. With the statistics library (§7.1) and FRED (§7.2) now able to *compute*
and *source* an empirical study, export is the last gap to shipping one end to end.

## What Changes

- **Core (pure, no I/O):** add `renderDashboardHtml(model, scenario)` that renders a
  scenario's dashboard to a **self-contained HTML document string** — headline stat
  tiles, charts as **inline SVG**, statement/KPI tables, and `note` prose. It composes
  the existing pure surfaces (`computeModel`, `getChartData`, `getStatement`); no new
  engine logic. Charts follow the `dataviz` conventions (palette, dual-axis, indexed
  rebasing). Everything is inlined (CSS + SVG) so the file is portable and offline.
- **Notes carry a minimal markdown subset** (headings, bold/italic, lists, links,
  paragraphs) so the narrative survives with structure. Full rich-text note authoring
  is Roadmap §7.4.
- **Print-optimized for PDF:** an `@media print` stylesheet so the HTML converts
  cleanly to PDF via the browser/desktop "print to PDF". A *programmatic* PDF-bytes
  export (headless renderer) is a deliberate follow-up — the HTML is the artifact and
  is print-to-PDF-ready.
- **Adapters expose it:** an API route (`GET /models/:id/export?scenario=&format=html`)
  returning the HTML document, and an MCP `export_dashboard` tool returning the HTML
  string. Thin wrappers over the core renderer; no model logic in the adapter.

## Capabilities

### New Capabilities
- `dashboard-export`: render a scenario's dashboard (tiles, charts, statements, note
  prose) to a self-contained, offline, deterministic HTML document, exposed through the
  API and MCP; print-optimized so it converts to PDF.

### Modified Capabilities
<!-- none -->

## Impact

- **Layer (core first):** new `packages/core/src/export.ts` (`renderDashboardHtml` +
  pure SVG chart + minimal-markdown helpers), a sibling to `outputs.ts`
  (`getChartData`/`getStatement`) — pure string production, no I/O, no new dependency
  (no recharts/React/headless browser in core). Then adapters:
  `apps/api` route → returns the HTML (as a downloadable document); `packages/mcp`
  `export_dashboard` tool → returns the HTML string. `computeModel` and the engine are
  untouched.
- **Integrity:** read-only presentation of an already-computed scenario; no balance/
  tie-out/validation impact. Deterministic: same model + scenario → byte-identical HTML.
- **Reproducibility:** the document is a **static snapshot** — it inlines the computed
  numbers at export time, so a shared analysis doesn't silently drift when the model
  changes later (matches the assessment's "publish = freeze" concern; full snapshot
  semantics for code cells are §7.5).

## Non-goals

- **No programmatic PDF bytes in v1** — the HTML is print-to-PDF-ready; a headless-
  browser PDF endpoint is a scoped follow-up (avoids bundling a browser in the API).
- Not interactive/live HTML — a static, self-contained snapshot, not the running app.
- Not rich-text note *authoring* (§7.4) — v1 renders a markdown subset from existing
  note text.
- Not Excel export (that's §1.5 / §2.5), and no `packages/core` engine change.
- No external assets, fonts, or network — fully inlined and offline.
