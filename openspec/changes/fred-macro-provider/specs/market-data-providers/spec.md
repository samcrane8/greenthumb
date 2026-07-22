## ADDED Requirements

### Requirement: Macro / economic data provider (FRED)

The provider registry SHALL include a macro/economic data provider backed by FRED
(Federal Reserve Bank of St. Louis), so economic series — money supply, central-bank
balance sheets, policy rates, FX — are sourceable in-tool as first-class series and
materialize through the same pipeline as price data. FRED **series IDs are the
symbols** (e.g. `M2SL`, `WALCL`, `FEDFUNDS`, `DTWEXBGS`). It is a **BYO-key** provider:
its key is read from local configuration (env or the local providers file) and MUST
NOT be written into model JSON, `packages/core`, or version control (the same
key-locality contract as the other keyed providers). A `quote` SHALL return the
series' latest observation; a `history` request SHALL return the observation series
over the requested range. Missing observations (FRED's `"."` value) SHALL be skipped.
An unconfigured key or an unresolvable series ID MUST produce a clear error, not a
silent empty result.

#### Scenario: FRED is registered as a keyed provider
- **WHEN** the available data providers are listed
- **THEN** the response includes a `fred` provider marked as requiring an API key

#### Scenario: a macro series' history is fetched and materialized
- **WHEN** history for a FRED series (e.g. `M2SL`) is requested with a configured key
- **THEN** the response is a dated series of that series' observations (missing `"."` values omitted), importable into a model's actuals like price history

#### Scenario: latest observation as a quote
- **WHEN** a quote for a FRED series is requested with a configured key
- **THEN** the response carries the latest observation's value, the `fred` source, and an as-of date

#### Scenario: missing key errors clearly
- **WHEN** a FRED quote or history is requested with no key configured
- **THEN** the request fails with a clear "requires an API key" error, not an empty success

## MODIFIED Requirements

### Requirement: Backtest-safe scope — price history, not point-in-time fundamentals

Historical import in v1 SHALL be limited to time series that are safe to backtest
against: **price series** (split/dividend adjusted) and **macro/economic series**
(e.g. FRED money-supply, balance-sheet, rate, and FX series). Fundamentals (e.g.
shares outstanding, revenue), if a provider returns them, MUST be labelled as
"as-of latest" and MUST NOT be written into historical actuals, to avoid lookahead
bias in backtesting. Macro/economic series are imported as **latest-published**
values (their point-in-time vintages, e.g. FRED/ALFRED revisions, are not aligned in
v1); this simplification MUST be documented as a backtest caveat for revised series,
consistent with how price providers already use latest-adjusted values.

#### Scenario: fundamentals are not imported as historical actuals
- **WHEN** a provider exposes fundamentals and a historical actuals import is attempted from them
- **THEN** the import is refused or the values are labelled as-of-latest and excluded from historical actuals

#### Scenario: macro series import as latest-published, with the caveat documented
- **WHEN** a FRED macro series is imported into historical actuals
- **THEN** the values are the latest-published observations and the revision/vintage caveat is documented (v1 does not align point-in-time vintages)
