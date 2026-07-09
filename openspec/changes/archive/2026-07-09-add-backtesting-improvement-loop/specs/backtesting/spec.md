## ADDED Requirements

### Requirement: Basic backtest of forecast against actuals

The system SHALL provide a `backtest` operation that scores a target item's
forecast against its stored actuals over the periods that have actuals, returning
per-period residuals together with the accuracy metric set (MAE, RMSE, MAPE,
bias). The backtest MUST be read-only. If the target item has no stored actuals
over the requested window, the backtest MUST error loudly rather than scoring
against missing data.

#### Scenario: backtest over the actuals window
- **WHEN** a backtest is run on item `revenue` for a model with actuals through period 5
- **THEN** the response returns per-period residuals for periods 0–5 and the metric set, and the stored model is unchanged

#### Scenario: no actuals errors loudly
- **WHEN** a backtest is requested for an item with no stored actuals
- **THEN** the operation returns an error naming the missing actuals rather than a zero-filled score

### Requirement: Out-of-sample holdout split

The system SHALL support splitting the actuals history into an in-sample window
and an untouched out-of-sample (holdout) window, and SHALL report accuracy for
each window separately, so that model quality is judged on data not used to tune
it. The holdout score MUST be reported distinctly from the in-sample score.

#### Scenario: split reports both windows
- **WHEN** a backtest splits history into in-sample periods 0–3 and holdout periods 4–5
- **THEN** the response reports the in-sample metric set and the holdout metric set separately

### Requirement: Walk-forward evaluation

The system SHALL provide a `walkForward` operation that repeatedly re-forecasts
using the point-in-time (as-of) compute across a rolling sequence of cutoffs —
calibrate/observe through period `t`, test on the next unseen window, roll forward
— producing many independent out-of-sample verdicts. It MUST support both an
anchored window (fixed start, growing end) and a rolling window (fixed length that
slides). Every vintage forecast MUST honor the look-ahead-bias guard.

#### Scenario: rolling verdicts
- **WHEN** a walk-forward is run with a one-period test step over a model with actuals through period 8
- **THEN** the response returns an ordered sequence of out-of-sample verdicts, one per step, each scoring the next unseen period against its actual

#### Scenario: anchored versus rolling window
- **WHEN** the same walk-forward is run once anchored and once rolling
- **THEN** the anchored run's calibration window grows from a fixed start while the rolling run's window slides at fixed length, and both report per-step out-of-sample scores

### Requirement: Backtesting flows through both adapters

Backtest, holdout, and walk-forward operations SHALL be exposed by the API
(`GET /models/:id/backtest`, `GET /models/:id/walkforward`) and by MCP tools
(`run_backtest`, `walk_forward`), returning the same results for the same inputs.

#### Scenario: adapter parity
- **WHEN** a backtest is requested via the API and via the MCP tool for the same model and item
- **THEN** both return the same residuals and metric set
