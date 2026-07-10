# market-data-providers Specification

## Purpose

Provide a pluggable registry of market-data providers, exposed through the API and
MCP, so a human or Claude can fetch current quotes and historical price series and
materialize them into a model — importing price history into the existing actuals
store and seeding drivers from live quotes — while keeping `packages/core` free of
I/O, keeping compute offline and reproducible, keeping provider keys local and out
of models, and limiting historical import to backtest-safe price series.

## Requirements

### Requirement: Pluggable provider registry

The system SHALL provide a registry of market-data providers, each exposing a common
interface, discoverable so a human or Claude can list available providers. The registry
MUST include at least one provider that works with no API key, so the feature is usable
with zero configuration. The provider layer MUST live in the adapters — `packages/core`
stays free of I/O and gains no dependency on it.

#### Scenario: providers are discoverable
- **WHEN** available data providers are listed
- **THEN** the response includes at least one provider, and each entry indicates whether it requires an API key

#### Scenario: a keyless provider works without configuration
- **WHEN** a quote or history is requested through the keyless default provider with no key configured
- **THEN** the request succeeds (or fails only on network/availability, not on a missing key)

### Requirement: Fetch quotes and price history

The system SHALL provide reads to fetch a symbol's current quote and its historical
price series from a selected provider, exposed through the API and MCP. An unknown
provider or an unresolvable symbol MUST return a clear error rather than a silent empty
result.

#### Scenario: fetch a current quote
- **WHEN** a quote is requested for a valid symbol
- **THEN** the response includes a price and the source provider and an as-of timestamp

#### Scenario: fetch price history
- **WHEN** price history is requested for a symbol over a range
- **THEN** the response is a dated series of prices from the provider

#### Scenario: unknown symbol errors clearly
- **WHEN** history is requested for a symbol the provider cannot resolve
- **THEN** the response is an explicit error, not an empty success

### Requirement: Import price history into the existing actuals store

Importing SHALL materialize a symbol's fetched price history into the model's existing
actuals store for a chosen item, aligning each model period to a provider price by the
timeline's calendar, and advancing `actualsThrough`. It MUST NOT introduce a separate
data store or bypass the actuals pipeline. Each imported value MUST carry provenance
(source provider and as-of timestamp).

#### Scenario: history populates actuals aligned to the timeline
- **WHEN** a symbol's history is imported into a model for an item
- **THEN** the item's actuals are populated per period from the provider prices and `actualsThrough` advances to the last imported period

#### Scenario: imported actuals feed backtesting
- **WHEN** actuals imported from a provider exist and the forecast is scored against them
- **THEN** the accuracy/backtest result reflects those actuals (they are ordinary actuals)

#### Scenario: imported values record their source
- **WHEN** a value is imported from a provider
- **THEN** it is stamped with the source provider and an as-of timestamp

### Requirement: Seed a driver from a live quote

The system SHALL allow seeding a driver's value from a provider's current quote, so a
model's starting assumption (e.g. a spot price or share count) can be set from live data
in one operation, recording the source and as-of timestamp.

#### Scenario: seed a driver from a quote
- **WHEN** a driver is seeded from a symbol's current quote
- **THEN** the driver's value is set from the quote and the model recomputes, with the source recorded

### Requirement: Fetching is explicit; compute never touches the network

Fetching and materialization SHALL be explicit operations that write into the model;
`computeModel` MUST NOT perform any network I/O. A model MUST remain reproducible — its
computed results do not change unless data is explicitly refreshed.

#### Scenario: compute is offline and stable
- **WHEN** a model with imported actuals is computed twice with no intervening refresh
- **THEN** both computations produce identical results and neither performs a network request

### Requirement: Provider keys stay local and are never persisted in models

Provider API keys SHALL be read from API/desktop configuration only, and MUST NOT be
written into any model's stored JSON, into `packages/core`, or into version control. An
endpoint MAY report whether a provider is configured, but MUST NOT return the key value.

#### Scenario: keys never appear in a model
- **WHEN** a model that used a keyed provider to import data is serialized
- **THEN** the serialized model contains no API key

#### Scenario: posture without leaking the key
- **WHEN** a client asks whether a provider is configured
- **THEN** the response indicates configured or not, without returning the key

### Requirement: Backtest-safe scope — price history, not point-in-time fundamentals

Historical import in v1 SHALL be limited to price series, which are split/dividend
adjusted and safe to backtest against. Fundamentals (e.g. shares outstanding, revenue),
if a provider returns them, MUST be labelled as "as-of latest" and MUST NOT be written
into historical actuals, to avoid lookahead bias in backtesting.

#### Scenario: fundamentals are not imported as historical actuals
- **WHEN** a provider exposes fundamentals and a historical actuals import is attempted from them
- **THEN** the import is refused or the values are labelled as-of-latest and excluded from historical actuals

### Requirement: Configuration via a Data Sources settings page

The web app SHALL provide a Data Sources settings page to select a provider and store
its key in local configuration, and to test the connection. It MUST NOT display or
persist the key anywhere other than local configuration.

#### Scenario: configure a provider
- **WHEN** the user selects a provider and saves a key on the Data Sources page
- **THEN** the key is stored in local configuration and subsequent fetches use it, without the key appearing in any model

#### Scenario: test the connection
- **WHEN** the user tests a configured provider
- **THEN** the app reports whether a sample fetch succeeds
