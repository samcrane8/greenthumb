## ADDED Requirements

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
