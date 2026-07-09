## ADDED Requirements

### Requirement: Charts are persisted definitions on the model

A `Model` SHALL support an optional ordered collection of `Chart` definitions. A
`Chart` MUST have a stable id, a title, a kind (`line`, `area`, `bar`, or
`composed`), and one or more series, each referencing a model item or driver by
name with an optional label, axis assignment (`left`/`right`), style, and an
`index` flag (rebase to 100 at the first period). Charts store only definitions —
never computed numbers.

#### Scenario: a chart persists with the model
- **WHEN** a chart is added to a model and the model is reloaded
- **THEN** the chart definition is present with its id, kind, and series references intact, and no numeric data is stored on it

#### Scenario: charts are optional and backward compatible
- **WHEN** a model created before this capability (no `charts` field) is loaded
- **THEN** it loads and validates successfully and is treated as having no charts

### Requirement: Chart series references are validated

Validation SHALL reject a chart whose series references a name that is not a known
item or driver (`DANGLING_CHART_REF`) and SHALL require chart ids to be unique
within a model, so a persisted chart can never point at a nonexistent series.

#### Scenario: dangling series reference is rejected
- **WHEN** a chart is written with a series referencing a name that does not exist in the model
- **THEN** the operation returns `ok === false` with a dangling-chart-reference issue, and it is not persisted unless overridden

#### Scenario: duplicate chart ids are rejected
- **WHEN** two charts share the same id
- **THEN** validation reports an error

### Requirement: Chart data is derived on demand for a scenario

The system SHALL provide a read path that computes a chart's referenced series for a
given scenario and returns chart-ready rows (one row per period with the series
values, indexed if requested), mirroring how statements are derived. No chart data
is cached on the model.

#### Scenario: chart data reflects the requested scenario
- **WHEN** chart data is requested for a chart under two different scenarios
- **THEN** the returned series reflect each scenario's computed values

#### Scenario: indexed series rebase to 100
- **WHEN** a series with `index: true` is returned
- **THEN** its first-period value is `100` and later values are proportional to the underlying series

### Requirement: Chart operations flow through core and both adapters

Chart create/update/remove SHALL be implemented as validate-on-write operations in
the core operation layer returning `{ model, issues, ok }`, exposed by the API under
`/models/:id/charts` (honoring `?preview=true` and `?override=true`) and by
corresponding MCP tools, with the chart-data read exposed on both. No chart logic is
duplicated in an adapter.

#### Scenario: preview does not persist
- **WHEN** a chart is added with `?preview=true`
- **THEN** the response returns the resulting model and issues but the stored model is unchanged

#### Scenario: MCP can create and list charts
- **WHEN** Claude calls the add-chart and list-charts MCP tools
- **THEN** the chart is created through the same core operation and appears in the list, with parity to the API result
