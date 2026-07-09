## ADDED Requirements

### Requirement: A model has an editable dashboard of ordered widgets

A `Model` SHALL support an optional `Dashboard` consisting of an ordered list of
`Widget`s. A `Widget` MUST have a stable id, a kind (`chart`, `stat`, `statement`,
or `note`), a grid layout (`x`, `y`, `w`, `h` on a fixed column grid), and a
kind-appropriate reference: a chart id for `chart`, an item name for `stat`, a
statement kind for `statement`, or text for `note`.

#### Scenario: dashboard persists with the model
- **WHEN** a dashboard with widgets is saved and the model reloaded
- **THEN** the widgets are present in order with their kinds, layout, and references intact

#### Scenario: dashboard is optional and backward compatible
- **WHEN** a model without a `dashboard` field is loaded
- **THEN** it loads and validates successfully and the web app falls back to the default statement view

### Requirement: Widget references are validated

Validation SHALL reject a widget whose reference does not resolve — a `chart` widget
pointing at a missing chart id, or a `stat`/`statement` widget pointing at a missing
item or invalid statement kind (`DANGLING_WIDGET_REF`) — and SHALL require widget ids
to be unique, so a persisted dashboard can never render a broken widget.

#### Scenario: widget referencing a missing chart is rejected
- **WHEN** a `chart` widget references a chart id that does not exist
- **THEN** the operation returns `ok === false` with a dangling-widget-reference issue

#### Scenario: duplicate widget ids are rejected
- **WHEN** two widgets share the same id
- **THEN** validation reports an error

### Requirement: Dashboard editing operations flow through core and both adapters

Add / update / remove / reorder widget operations SHALL be validate-on-write
operations in the core operation layer returning `{ model, issues, ok }`, exposed by
the API under `/models/:id/dashboard` (honoring `?preview=true` and `?override=true`)
and by corresponding MCP tools. Reordering MUST preserve every widget and only change
order/layout.

#### Scenario: reorder preserves widgets
- **WHEN** a reorder operation moves a widget from last to first
- **THEN** the resulting dashboard contains the same set of widget ids in the new order with no widget lost or duplicated

#### Scenario: preview does not persist a layout change
- **WHEN** a widget is added with `?preview=true`
- **THEN** the response returns the updated model and issues but the stored dashboard is unchanged

### Requirement: The web app renders and edits the dashboard

The web app SHALL render a model's dashboard by laying out its widgets on the grid —
charts via the chart renderer, stat widgets as headline tiles, statement widgets as
the data grid, note widgets as text — and SHALL provide an edit mode to add, remove,
reorder, and resize widgets, persisting changes through the dashboard API. When a
model has no dashboard, the app SHALL fall back to the current statement view.

#### Scenario: dashboard renders mixed widget kinds
- **WHEN** a model with chart, stat, and statement widgets is opened
- **THEN** each widget renders in its grid position using the appropriate renderer

#### Scenario: edits persist through the API
- **WHEN** the user adds a chart widget and reorders it in edit mode
- **THEN** the change is saved via the dashboard API and survives a reload
