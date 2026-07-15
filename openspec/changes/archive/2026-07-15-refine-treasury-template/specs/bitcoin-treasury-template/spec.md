## ADDED Requirements

### Requirement: Treasury company identity is parameterized by ticker

The `bitcoin_treasury` template SHALL derive the modeled company's identity from a
`ticker` supplied through `CreateModelOptions`, rather than hardcoding any single
company. When no ticker is supplied, the template MUST default to a neutral
placeholder ticker (`CO`) and MUST NOT attribute the model to any specific real
company. The price and market-cap line items MUST be named
`${ticker_lowercased}_price` and `${ticker_lowercased}_mcap`, and every internal
reference to them — the common-share dilution formula, the display-scale tagging,
chart series references, and dashboard widgets — MUST resolve to those names.
Human-readable chart titles and series labels MUST use the uppercased ticker, and
MUST NOT hardcode a company's common or preferred ticker (e.g. `ASST`, `SATA`).
The `ticker` SHALL be exposed through the adapters that create models (the API
store endpoint, the web client and workspace, and the MCP scaffold tool).

#### Scenario: default ticker is a neutral placeholder
- **WHEN** a `bitcoin_treasury` model is created without a `ticker`
- **THEN** the price item is named `co_price`, the market-cap item is named `co_mcap`, and no chart title or label contains `ASST` or `SATA`

#### Scenario: a supplied ticker names the price and market-cap items
- **WHEN** a `bitcoin_treasury` model is created with `ticker: "MSTR"`
- **THEN** the model has items named `mstr_price` and `mstr_mcap`, the `new_shares` formula divides by `mstr_price`, and the price/index charts and the headline stat widget reference `mstr_price`

#### Scenario: labels reflect the ticker and validate
- **WHEN** a `bitcoin_treasury` model is created with a given ticker
- **THEN** chart titles and series labels display the uppercased ticker, and the model passes `validateModel` with no dangling-reference errors

#### Scenario: Strive is expressible, not assumed
- **WHEN** a `bitcoin_treasury` model is created with `ticker: "ASST"`
- **THEN** the price and market-cap items are named `asst_price` and `asst_mcap`, matching the template's prior naming

## MODIFIED Requirements

### Requirement: Template scaffolds the levered residual claim structure

The `bitcoin_treasury` builder SHALL emit drivers and formula items that model the
company's common equity as a levered residual claim on a crypto reserve. It MUST
include, at minimum: a reserve value (`btc_held * btc_price`), a perpetual-preferred
notional and its periodic dividend obligation, a **debt notional (straight plus
convertible)**, a cash balance, common shares outstanding, `nav_to_common = reserve +
cash + other_holdings - debt_notional - preferred_notional`, `nav_per_share`, an mNAV
multiple, a common price `${ticker}_price = max(nav_per_share, 0) * mnav`, a market
cap `${ticker}_mcap = ${ticker}_price * common_shares`, and `implied_leverage = reserve
/ nav_to_common`. The `other_holdings` driver MUST represent only genuine holdings
(e.g. STRC); debt MUST be modeled through the dedicated debt line, not as a negative
`other_holdings`.

#### Scenario: core outputs are present and computable
- **WHEN** the template model is computed for its base scenario
- **THEN** the computed series include reserve value, NAV-to-common, NAV per share, mNAV, price, and implied leverage, each defined over every period

#### Scenario: common equity is levered to the reserve
- **WHEN** the reserve value rises while preferred notional is held fixed
- **THEN** `nav_per_share` rises by a larger percentage than the reserve (implied leverage > 1x)

#### Scenario: debt subtracts from common NAV
- **WHEN** the `debt_notional` driver is increased while all else is held fixed
- **THEN** `nav_to_common` and `nav_per_share` decrease by the added debt, and `other_holdings` is unaffected

### Requirement: Template exposes tunable assumptions as drivers

The template SHALL express its key assumptions as drivers — including at least a crypto
price series, preferred issuance pace, preferred dividend rate, common ATM issuance, and
an mNAV target — so a human or Claude can tune the model via `set_assumption`/scenarios
rather than editing formulas. Preferred issuance SHALL follow the S-curve ramp
**uncapped**: `preferred_notional` accumulates the ramped `preferred_raise` every period
and grows over the horizon, with no ceiling tying notional to a multiple of reserve. The
crypto price driver (`btc_price`) SHALL be a **commodity-priced driver bound to the
Bitcoin power-law model** (trend plus halving-cycle oscillation), spot-anchored to the
template's starting spot, rather than a constant-rate compounding path; formulas reference
it by name so the reserve build is unchanged.

#### Scenario: adjusting an assumption changes outputs
- **WHEN** the preferred dividend-rate driver is increased via `set_assumption`
- **THEN** the recomputed dividend obligation increases and dividend coverage decreases, with the write validating successfully

#### Scenario: issuance ramp uses an S-curve
- **WHEN** the preferred issuance series is defined via the `scurve`/`logistic` primitives over the ramp assumption
- **THEN** issuance starts near the configured start pace and ramps toward the peak pace over the ramp horizon

#### Scenario: preferred notional grows uncapped over time
- **WHEN** the template model is computed over its full horizon with a positive issuance ramp
- **THEN** `preferred_notional` is non-decreasing period over period and exceeds any fixed multiple of the starting reserve in later periods (it is not clamped to `amplification_cap × reserve`)

#### Scenario: BTC price follows the power law with oscillation
- **WHEN** a fresh `bitcoin_treasury` model is created and computed
- **THEN** the `btc_price` driver's series is the spot-anchored Bitcoin power law (period 0 at the starting spot, then arcing up through fair value and back per the halving-cycle oscillation), not a constant-growth line
