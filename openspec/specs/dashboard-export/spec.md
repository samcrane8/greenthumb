# dashboard-export Specification

## Purpose

Render a model's dashboard for a chosen scenario to a self-contained, shareable HTML
document via a pure core function that composes the existing derivations
(`computeModel`, `getChartData`, `getStatement`) rather than re-deriving numbers —
inlining all styles and imagery, drawing charts as inline SVG, rendering note prose
from a safe markdown subset, and exposing the renderer through the API and MCP with a
print stylesheet so it converts cleanly to PDF.

## Requirements

### Requirement: Render a scenario's dashboard to a self-contained HTML document

The system SHALL render a model's dashboard for a given scenario to a **self-contained
HTML document** produced by a **pure** core function (no I/O, no network), so a
shareable analysis can be generated through the automatable surface. The document MUST
include every dashboard widget type: headline **stat** tiles (value + unit + horizon
delta), **chart** widgets (as inline SVG), **statement**/KPI tables, and **note** prose.
It MUST compose the existing pure derivations (`computeModel`, `getChartData`,
`getStatement`) rather than re-deriving numbers, and MUST NOT depend on a browser,
React, or a charting runtime in core. All CSS and imagery MUST be **inlined** — the
file MUST render with no external asset, font, or network request.

#### Scenario: a dashboard renders to one HTML document
- **WHEN** a model with a dashboard is exported for a scenario
- **THEN** a single HTML document string is returned containing the stat tiles, charts, statement tables, and note text of that dashboard, with all styles inlined

#### Scenario: numbers reflect the selected scenario
- **WHEN** the same dashboard is exported for two different scenarios
- **THEN** the rendered values and chart series differ per scenario (they come from `computeModel` for that scenario), and each resolves without dangling references

#### Scenario: export is offline and deterministic
- **WHEN** the same model + scenario is exported twice with no intervening change
- **THEN** the two documents are byte-identical, and rendering performs no network request

### Requirement: Charts render as inline SVG from computed series

Chart widgets SHALL render as **inline SVG** built from the computed series, honoring
the chart definition: `line` / `area` / `bar` / `composed` kinds, left/right (dual)
axes, and `index` rebasing to 100. Series colors SHALL follow the project's `dataviz`
palette and remain legible (sufficient contrast, distinguishable series). A chart whose
series reference resolves to no data MUST degrade gracefully (empty chart or a labeled
placeholder), not crash the export.

#### Scenario: a dual-axis indexed chart renders
- **WHEN** a chart with a left and right axis and an indexed series is exported
- **THEN** the SVG shows both axes and the indexed series rebased to 100 at the first period

#### Scenario: chart kinds are supported
- **WHEN** line, area, bar, and composed charts are exported
- **THEN** each renders its series as SVG paths/areas/bars per its kind

### Requirement: Note prose carries a markdown subset

`note` widget text SHALL be rendered from a **minimal markdown subset** — headings,
bold, italic, unordered/ordered lists, links, and paragraphs — so the narrative
survives with structure. Unsupported markdown MUST degrade to plain text, and the
renderer MUST escape HTML in note text so exported content cannot inject markup.

#### Scenario: markdown narrative renders with structure
- **WHEN** a note contains headings, a list, and bold text
- **THEN** the exported HTML shows the corresponding structured elements

#### Scenario: note text is escaped
- **WHEN** a note contains raw HTML or angle brackets
- **THEN** it is escaped in the output (rendered as text, not executed)

### Requirement: Export is exposed through the API and MCP, print-optimized for PDF

The core renderer SHALL be exposed through the adapters: an **API route**
(`GET /models/:id/export`, scenario- and format-parameterized, `format=html` in v1)
returning the HTML document, and an **MCP `export_dashboard` tool** returning the HTML
string — thin wrappers that add no model logic. The document SHALL include an
`@media print` stylesheet so it converts cleanly to PDF via the browser/desktop print
path. A programmatic PDF-bytes export is out of v1 scope.

#### Scenario: export through the API
- **WHEN** a client requests the export route for a model and scenario with `format=html`
- **THEN** the response is the self-contained HTML document for that dashboard

#### Scenario: export through MCP
- **WHEN** the `export_dashboard` tool is called for a model and scenario
- **THEN** it returns the HTML document string an agent can save or share

#### Scenario: HTML is print-ready
- **WHEN** the exported document is printed to PDF from a browser
- **THEN** the print stylesheet lays the dashboard out on the page without clipped charts or tables
