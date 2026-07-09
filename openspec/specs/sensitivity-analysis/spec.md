# sensitivity-analysis Specification

## Purpose

Provide read-only sensitivity tooling over the core engine: sweep a single driver
across a range, rank drivers by output impact with a tornado analysis, and
generate scenario grids programmatically from driver axes with an explicit
combination cap.

## Requirements

### Requirement: Sweep a single driver across a range

The system SHALL provide a `sweepDriver` operation that recomputes a model for
each value in a supplied range of a single driver, holding all other inputs
constant, and returns the resulting output series per swept value. The sweep MUST
be read-only and MUST NOT persist any change to the model.

#### Scenario: one-at-a-time sweep
- **WHEN** driver `growth_rate` is swept over `[0.05, 0.10, 0.15]` against output item `revenue`
- **THEN** three output series are returned, one per swept value, and the stored model is unchanged

### Requirement: Tornado ranking of drivers by impact

The system SHALL provide a `tornado` operation that perturbs each driver
one-at-a-time by a specified delta, measures the change in a target output at a
specified period, and returns the drivers ranked by the magnitude of that change,
so the few dominant drivers are identified before scenarios are designed.

#### Scenario: rank drivers by influence
- **WHEN** a tornado is run on output `nav_per_share` at the final period with a ±10% perturbation
- **THEN** the response lists each driver with its output impact, ordered from largest absolute impact to smallest

### Requirement: Programmatic scenario and grid generation

The system SHALL generate scenarios programmatically from a set of driver axes
(each a driver with a list of values), producing the combination grid as
generated scenario overlays for analysis. The generator MUST enforce an explicit
cap on the number of combinations and MUST report when a requested grid exceeds
the cap rather than silently truncating.

#### Scenario: generate a parameter grid
- **WHEN** axes `growth_rate ∈ [0.05, 0.10]` and `churn ∈ [0.01, 0.02]` are requested
- **THEN** four generated scenarios covering every combination are returned

#### Scenario: oversized grid is reported, not truncated
- **WHEN** a requested grid would exceed the combination cap
- **THEN** the operation reports the overflow and the cap instead of silently returning a partial set
