# commodity-price-models Specification

## Purpose

Provide a registry of commodities and their named, pure price-model generators —
starting with Bitcoin's power-law model with cyclical oscillation — so a human or
Claude can discover available commodities and generate a per-period price series from a
timeline without changing the calc engine, which stays index-based and date-free.

## Requirements

### Requirement: A registry of commodities and price models

The system SHALL provide a registry of commodities, each exposing one or more named
price models, mirroring how model templates are registered. Each price model SHALL be a
pure generator that, given a timeline and parameters, returns a per-period price series
(`number[]`). Bitcoin SHALL be registered with a power-law price model. The registry
MUST be discoverable so a human or Claude can list available commodities and their
models.

#### Scenario: commodities are discoverable
- **WHEN** available commodities are listed via the API or MCP
- **THEN** the response includes `bitcoin` with at least one price model (its power law)

#### Scenario: a price model generates a full series
- **WHEN** a price model is generated over a timeline of N periods
- **THEN** it returns N finite prices, one per period

### Requirement: Price generation is date-based but engine-independent

Price generation SHALL derive each period's calendar date from the timeline's start and
granularity and MUST NOT require any change to the calc engine — the engine stays
index-based and never reads dates during compute. A generated series is stored as an
ordinary driver value series.

#### Scenario: generation uses timeline dates, compute does not
- **WHEN** a commodity price series is generated for a model and the model is then computed
- **THEN** the generated values feed compute as ordinary driver values, and `computeModel` reads no calendar dates

### Requirement: Bitcoin power-law model with cyclical oscillation

The Bitcoin power-law model SHALL compute price as a power-law **trend**
`coefficient · days_since_genesis ^ exponent` (days measured from the 2009-01-03 genesis
block) multiplied by a **cyclical oscillation** around that trend —
`exp(amplitude · sin(2π · years / cycleYears + φ))` — so the series arcs above and below
fair value over the halving cycle rather than rising monotonically. It SHALL ship
canonical default parameters (trend fit, band multipliers, and oscillation `cycleYears`
and `amplitude`), SHALL support a **band** multiplier (support / fair / resistance), and
SHALL support an optional **spot anchor** that both pins period 0 to a supplied current
spot AND infers the cycle phase `φ` from that spot's deviation from trend, choosing the
rising arc — so a spot below trend starts the series in the trough heading up.

#### Scenario: price oscillates around the trend rather than rising monotonically
- **WHEN** the model is generated over a horizon spanning at least one full cycle
- **THEN** the price rises above and then falls back below its own power-law trend at least once (it is not monotonic), and every value is finite and positive

#### Scenario: a below-trend spot starts in the trough heading up
- **WHEN** the model is generated with a spot anchor below the trend's fair value at period 0
- **THEN** the period-0 price equals that spot and the next several periods rise toward and through fair value before later reversing

#### Scenario: spot anchor pins period 0
- **WHEN** the model is generated with a spot anchor of a given current price
- **THEN** the period-0 price equals that spot (within rounding)

#### Scenario: band applies a corridor multiplier
- **WHEN** the model is generated at the `support` band versus the `fair` band with all else equal
- **THEN** the support series is uniformly below the fair series
