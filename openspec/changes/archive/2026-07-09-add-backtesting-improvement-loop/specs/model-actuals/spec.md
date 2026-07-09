## ADDED Requirements

### Requirement: Store observed actuals as first-class data

The system SHALL store observed historical values keyed by `(model, item,
period)` in SQLite (not in the model JSON), each with an optional import source
for provenance. Writing an actual for an existing `(model, item, period)` MUST
upsert (replace) rather than duplicate. Actuals SHALL be storage that lives
alongside the model, so that large historical time series do not bloat the
diffable model file.

#### Scenario: ingest actuals via the API
- **WHEN** a caller POSTs actual values for item `revenue` at periods 0–3 to `POST /models/:id/actuals`
- **THEN** the values are stored with their source and can be read back for those periods

#### Scenario: re-ingesting a period replaces, not duplicates
- **WHEN** an actual for `(model, revenue, period 2)` is ingested twice with different values
- **THEN** only the latest value is stored for that period

### Requirement: CSV import with column-to-item mapping

The system SHALL accept a CSV of historical values and a mapping of CSV columns
to model items, ingesting each mapped column as an actuals series aligned to the
timeline. Rows that cannot be mapped or parsed MUST be reported rather than
silently dropped.

#### Scenario: mapped import
- **WHEN** a CSV with columns `month, revenue, cogs` is imported with `revenue→revenue` and `cogs→cogs` mappings over a model's periods
- **THEN** both items receive actuals for the covered periods and the response reports how many periods were ingested per item

#### Scenario: unmapped column reported
- **WHEN** a CSV contains a column with no item mapping
- **THEN** the import completes for mapped columns and the response names the unmapped column instead of failing silently

### Requirement: Join forecast against actuals

The system SHALL provide a read that returns, per period for a target item, the
forecast value, the actual value (where present), and their residual, so a human
or agent can see forecast-vs-actual directly. The join MUST be read-only.

#### Scenario: forecast-vs-actual join
- **WHEN** a caller requests the forecast-vs-actual view for item `revenue`
- **THEN** each period returns `{ forecast, actual, residual }`, with `actual` absent for periods that have no stored actual, and the stored model is unchanged

### Requirement: Point-in-time re-forecast (as-of)

The engine SHALL support computing a model *as of* a past period `t`: stored
actuals for periods `≤ t` are substituted into item series (locking known
history) and periods `> t` are forecast forward from that frozen state. A formula
that reads a period `> t` of an item that has actuals MUST be flagged as a
look-ahead-bias violation via a validation issue, and a backtest relying on the
as-of compute MUST refuse to run when that guard trips. The as-of compute MUST be
an option on the existing compute path, not a parallel implementation, so that an
as-of compute at the final period equals the ordinary forward compute.

#### Scenario: knowledge frozen as of a past period
- **WHEN** a model with actuals through period 5 is computed as-of period 3
- **THEN** periods 0–3 reflect stored actuals and periods 4+ are forecast forward from period 3's state

#### Scenario: look-ahead read is rejected
- **WHEN** an as-of period-3 compute would require reading an actuals-bearing item at period 4
- **THEN** a look-ahead-bias validation issue is raised and any backtest depending on it refuses to run

#### Scenario: as-of at the horizon equals ordinary compute
- **WHEN** an all-forecast model is computed as-of its last period
- **THEN** the result equals the ordinary forward compute of the same model
