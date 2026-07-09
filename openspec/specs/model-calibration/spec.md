# model-calibration Specification

## Purpose

Fit a bounded set of drivers to historical actuals over an in-sample window to
minimize a chosen accuracy metric, report the residuals so structural (not just
input) errors surface, and route the result through the existing preview/accept
flow gated on out-of-sample accuracy so overfitting is rejected.

## Requirements

### Requirement: Fit drivers to historical actuals

The system SHALL provide a `calibrate` operation that searches values for a
specified set of drivers to minimize a chosen accuracy metric over an in-sample
window of actuals, using a bounded search (a grid over each driver's bounded
range refined by local coordinate descent). Calibration MUST be bounded — driver
values MUST stay within supplied bounds — and MUST NOT perform gradient or
unbounded optimization. Calibration SHALL fit only against the in-sample window,
never the holdout.

#### Scenario: fit a driver to history
- **WHEN** `calibrate` is run on driver `growth_rate` (bounds 0–0.3) to minimize RMSE of `revenue` over in-sample periods 0–4
- **THEN** the response returns the best-fitting value within bounds and the in-sample score at that value

#### Scenario: fitting stays within bounds
- **WHEN** the metric would keep improving beyond the supplied upper bound
- **THEN** the returned value is clamped at the bound rather than exceeding it

### Requirement: Calibration reports residuals as a structural to-do list

The `calibrate` operation SHALL return the per-period residuals at the best-fit
settings and rank the largest systematic misses, so that the caller can read
where the model's structure — not just its inputs — is likely wrong. When no
setting within bounds reproduces history acceptably, the operation MUST report
that the structure, not the assumptions, is the likely fault.

#### Scenario: residuals surfaced
- **WHEN** calibration completes
- **THEN** the response includes per-period residuals and a ranked list of the largest systematic misses

#### Scenario: no acceptable fit flags structure
- **WHEN** no value within bounds brings the in-sample error under an acceptable threshold
- **THEN** the response signals that a structural fix is likely needed rather than presenting a best-of-bad fit as calibrated

### Requirement: Calibration output flows through the preview/accept path and an out-of-sample gate

Calibration MUST NOT auto-commit changes to the stored model. It SHALL return a
candidate driver setting that the caller applies through the existing
`preview → accept` review flow. An accepted calibration change SHALL be gated on
out-of-sample accuracy: the caller MUST re-backtest on the holdout, and the change
is only an improvement if holdout error falls, never if only in-sample fit
improves.

#### Scenario: candidate is previewed, not committed
- **WHEN** `calibrate` returns a best-fit driver value
- **THEN** the stored model is unchanged and the value is applied only via a subsequent preview/accept assumption edit

#### Scenario: out-of-sample gate rejects overfitting
- **WHEN** a calibrated change lowers in-sample error but raises holdout error on re-backtest
- **THEN** the change is reported as failing the out-of-sample gate and is not treated as an improvement
