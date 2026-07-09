# forecast-accuracy Specification

## Purpose

Provide pure, I/O-free forecast-accuracy metrics (MAE, RMSE, MAPE, bias) in the
core engine and a read-only operation to score a model's forecast for a target
item against a supplied actuals series, returning the full metric set together so
failure modes hidden by any single number stay visible.

## Requirements

### Requirement: Forecast-accuracy metric functions

The core engine SHALL provide pure functions that compute forecast-accuracy
metrics from an actual series and a forecast series of equal length: mean
absolute error (MAE), root-mean-square error (RMSE), mean absolute percentage
error (MAPE), and mean signed error (bias). The functions MUST live in
`packages/core` with no I/O and MUST treat aligned index positions as the same
period. MAPE MUST skip periods where the actual value is zero (to avoid division
by zero) and MUST report the count of periods actually scored. Bias MUST be
computed as `mean(forecast − actual)` so that its sign indicates the direction
of systematic error.

#### Scenario: metrics on a simple series
- **WHEN** actuals `[100, 100]` are scored against forecast `[130, 90]`
- **THEN** MAE is 20, bias is +10 (systematic over-forecast), and RMSE (≈22.36) exceeds MAE because a larger single miss is penalized disproportionately

#### Scenario: MAPE skips zero actuals
- **WHEN** actuals `[0, 50]` are scored against forecast `[10, 55]`
- **THEN** the zero-actual period is excluded from MAPE (which is computed on the remaining period as 10%) while both periods still count toward MAE/RMSE/bias, and the response reports the MAPE-scored period count

### Requirement: Score a model's forecast against actuals

The system SHALL provide a `scoreForecast` operation that, given a model, a
target item, and an actuals series, computes the item's forecast via the engine
and returns the metric set `{ mae, rmse, mape, bias, n }` together — never a
single metric alone — so a failure mode hidden by one number is visible in the
others. Scoring SHALL be read-only and MUST NOT mutate the stored model.

#### Scenario: scoring returns the full metric set
- **WHEN** a caller scores item `revenue` against a supplied actuals series
- **THEN** the response contains mae, rmse, mape, bias, and the scored-period count n, all populated, and the stored model is unchanged

#### Scenario: scoring is exposed through both adapters
- **WHEN** the score is requested via the API `GET /models/:id/score` and via the MCP `score_forecast` tool for the same model and item
- **THEN** both return the same metric set for the same scenario
