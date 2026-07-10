# timeline-editing Specification

## Purpose

Let users reshape a model's timeline after creation — grow or shrink the period
count, relabel the granularity, and choose both up front at creation — as
validate-on-write operations in the core operation layer that flow through both
the API and the MCP adapters.

## Requirements

### Requirement: Set the timeline period count up or down

The system SHALL provide an operation to set a model's number of periods to any
value ≥ 1 — shrinking as well as growing the horizon — not only extending it. The
operation MUST clamp `actualsThrough` to remain a valid index (`< periods`) and MUST
NOT destroy stored per-period values, so that shrinking then re-growing restores the
original series.

#### Scenario: shrinking the horizon
- **WHEN** a model with 16 periods has its period count set to 8
- **THEN** the model reports 8 periods and computes over 8 periods, and the write validates

#### Scenario: re-growing restores prior values
- **WHEN** a model is shrunk from 16 to 8 periods and then set back to 16
- **THEN** the periods beyond 8 hold the values they had before shrinking

#### Scenario: actuals index stays valid
- **WHEN** a model with `actualsThrough = 10` is shrunk to 6 periods
- **THEN** `actualsThrough` is clamped to at most 5 and the model still validates

### Requirement: Set the timeline granularity

The system SHALL provide an operation to set a model's granularity
(monthly/quarterly/annual). Because the engine is granularity-agnostic, this SHALL
relabel the axis without resampling stored values.

#### Scenario: changing granularity relabels the axis
- **WHEN** a monthly model's granularity is set to quarterly
- **THEN** `timeline.granularity` is quarterly, the per-period values are unchanged, and the model validates

### Requirement: Choose timeline at creation through every adapter

Creating a model SHALL allow specifying granularity and period count up front through
the API and the MCP `create_model` tool, so a model can start at the desired horizon
without a follow-up edit.

#### Scenario: create with a chosen horizon
- **WHEN** a model is created via MCP with granularity quarterly and 8 periods
- **THEN** the created model has 8 quarterly periods

### Requirement: Set the timeline start date

The system SHALL provide a way to set a model's timeline **start date** — both at
creation and as an edit operation — so period labels reflect the real calendar
window a model covers (e.g. a history beginning Q3 2020), not a fixed default.
Setting the start date MUST regenerate any commodity-bound drivers, because
commodity price generation reads calendar dates, and MUST validate on write like
other timeline edits, returning `{ model, issues, ok }` and honoring `?preview`.

#### Scenario: choose the start date at creation
- **WHEN** a model is created with a start date of `2020-07-01`
- **THEN** the model's timeline starts at `2020-07-01` and its period labels reflect that window

#### Scenario: change the start date after creation
- **WHEN** an existing model's start date is set to `2020-07-01`
- **THEN** the timeline start becomes `2020-07-01`, commodity-bound drivers are regenerated over the new dates, and the model validates

#### Scenario: start date is settable through both adapters
- **WHEN** the start date is set via the `create_model` / `set_timeline` MCP tools and via the API
- **THEN** both apply the new start date and return the updated model (or a preview when requested)

### Requirement: Timeline operations flow through core and both adapters

Timeline edits SHALL be validate-on-write operations in the core operation layer
returning `{ model, issues, ok }`, exposed by the API (honoring `?preview=true` and
`?override=true`) and by MCP tools.

#### Scenario: preview a timeline change without persisting
- **WHEN** a period-count change is requested with `?preview=true`
- **THEN** the response returns the candidate model and issues but the stored model is unchanged

### Requirement: actualsThrough is the load-bearing forecast cutover

The `Timeline.actualsThrough` index SHALL be a load-bearing forecast cutover
consumed by the actuals join, backtest, and calibration operations — not only a
display marker. Periods at or before `actualsThrough` are treated as the actuals
region and periods after it as the forecast region. Existing timeline edits MUST
continue to clamp `actualsThrough` to a valid index, so wiring this meaning in
does not change the behavior of existing timeline operations.

#### Scenario: cutover consumed by backtest
- **WHEN** a model has `actualsThrough = 5` and a backtest is run
- **THEN** the backtest treats periods 0–5 as the actuals region for forecast-vs-actual scoring

#### Scenario: existing clamp behavior preserved
- **WHEN** a model with `actualsThrough = 10` is shrunk to 6 periods
- **THEN** `actualsThrough` is still clamped to at most 5 and the model validates, unchanged from prior behavior

### Requirement: Per-item actuals coverage refines the cutover

The actuals join and the as-of compute SHALL determine an item's actuals region
from the periods that item actually has stored actuals for (because actuals
arrive per item and ragged), using `actualsThrough` as the default cutover where
per-item coverage is absent. An as-of period request MUST clamp to the minimum of
the requested period and each item's available coverage.

#### Scenario: ragged coverage respected
- **WHEN** item `revenue` has actuals through period 6 and item `headcount` has actuals through period 4, with an as-of request at period 6
- **THEN** the as-of compute locks `revenue` through period 6 and `headcount` through period 4, forecasting each item beyond its own coverage
