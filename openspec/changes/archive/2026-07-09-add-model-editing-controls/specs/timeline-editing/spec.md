## ADDED Requirements

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

### Requirement: Timeline operations flow through core and both adapters

Timeline edits SHALL be validate-on-write operations in the core operation layer
returning `{ model, issues, ok }`, exposed by the API (honoring `?preview=true` and
`?override=true`) and by MCP tools.

#### Scenario: preview a timeline change without persisting
- **WHEN** a period-count change is requested with `?preview=true`
- **THEN** the response returns the candidate model and issues but the stored model is unchanged
