## Context

A model carries a `dashboard` (12-col grid of `stat` / `chart` / `statement` / `note`
widgets). Core already derives all the presentation *data* purely: `computeModel`
(engine), `getChartData` and `getStatement` (`outputs.ts`). The web app renders these
via recharts/React; the desktop is that web app. There is no way to get a rendered,
shareable document out of the automatable (API/MCP) surface — only JSON.

The architecture rule (core is the single, pure source of truth; adapters are thin)
plus the fact that rendering a dashboard to an HTML string is a **pure transform**
(model + scenario → string) means the renderer belongs in core next to
`getChartData`/`getStatement`, and the adapters just return its output as a file/string.

## Goals / Non-Goals

**Goals:** a pure core renderer that turns a scenario's dashboard into one
self-contained, offline, deterministic HTML document (tiles, inline-SVG charts,
statement tables, note prose); exposed via API + MCP; print-to-PDF ready.

**Non-Goals:** programmatic PDF bytes (headless browser — follow-up); interactive HTML;
rich-text note authoring (§7.4); Excel; any engine change or new core dependency.

## Decisions

### The renderer is pure core, composing existing derivations
`packages/core/src/export.ts` exports `renderDashboardHtml(model, scenario, opts?)`
returning a `string`. For each widget it calls the existing pure functions —
`computeModel` once, then `getChartData` per chart widget and `getStatement` per
statement widget — and emits HTML. No React, no recharts, no headless browser, **no new
dependency**: charts are hand-built SVG. This keeps it testable (string in/out),
deterministic, and reusable by every adapter.
- *Alternative rejected — headless-browser render of the React app:* would "share the
  desktop renderer" but bundles a browser into the API, is non-deterministic, slow, and
  violates the pure-core rule. Not worth it for a static snapshot.

### Charts as hand-built inline SVG (dataviz conventions)
A small pure SVG builder maps a `ChartData` (from `getChartData`) to `<svg>`: polylines
for `line`, filled areas for `area`, `<rect>` bars for `bar`, and their overlay for
`composed`; left/right axis scaling; `index` rebasing already handled by `getChartData`.
Colors/spacing follow the `dataviz` palette and contrast rules (load the `dataviz` skill
at implementation time). Degenerate/empty series render an empty plot with a label, never
throw.
- Scope guard: v1 targets the chart kinds the templates actually use (line/area/bar/
  composed, dual-axis, indexed). Exotic combos degrade gracefully.

### Minimal, safe markdown for notes
A tiny pure markdown subset (headings `#`, `**bold**`, `*italic*`, `-`/`1.` lists,
`[text](url)`, paragraphs) → HTML, with **all note text HTML-escaped first** so exported
content can't inject markup. Anything outside the subset renders as escaped text. Full
rich-text authoring is §7.4; this only needs narrative to survive.

### Self-contained + print-ready
One `<style>` block (inlined), no external fonts/assets/scripts, plus an `@media print`
section (page margins, avoid breaking a chart/table across pages) so the browser/desktop
"Print → Save as PDF" yields a clean PDF. That satisfies "HTML and PDF" without bundling
a PDF engine; a programmatic PDF-bytes endpoint is a later change.

### Adapters are thin
- API: `GET /models/:id/export?scenario=<name>&format=html` → load model, resolve
  scenario, `renderDashboardHtml`, return with `Content-Type: text/html` (and a
  `Content-Disposition` attachment name). Unknown format → 400.
- MCP: `export_dashboard(modelId, scenario?)` → returns the HTML string (an agent saves
  it). Neither adapter adds model logic.

### Static-snapshot semantics
The document inlines the computed numbers at export time, so a shared analysis doesn't
silently change when the model is later edited (the assessment's "publish = freeze"
concern for defensible claims). Full cell-level snapshotting is §7.5.

## Risks / Trade-offs

- [Hand-built SVG won't match recharts exactly] → Acceptable: the export is a clean
  static rendering, not a pixel copy of the interactive UI. Keeps core pure/dependency-
  free and deterministic.
- [PDF is via print, not programmatic bytes] → Documented; the HTML is print-optimized
  and the desktop can already print. A headless-browser PDF endpoint is a scoped follow-up.
- [Determinism vs. timestamps] → The document MUST NOT embed a wall-clock timestamp in
  its body (would break byte-identical determinism); if an "as of" date is wanted, take
  it from the model/timeline, not `Date.now()`.

## Migration Plan

- Additive: new pure core module + one API route + one MCP tool. Rebuild core before the
  API (runtime import). No client change required; the web app can add a "Download HTML"
  button later.
- Rollback: remove the route/tool and the module; nothing persisted depends on it.
