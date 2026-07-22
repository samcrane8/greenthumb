# bitcoin-treasury-template Specification

## Purpose

Provide a `bitcoin_treasury` model template that scaffolds a company's common
equity as a levered residual claim on a crypto reserve — reserve value,
perpetual-preferred notional and dividends, cash, common shares, NAV-to-common,
NAV per share, mNAV multiple, price, and implied leverage — with tunable
assumptions expressed as drivers, ready-made scenarios, and a default dashboard,
so the model is discoverable, valid, and presentable immediately after creation
through the web picker, the API, and the MCP tools.

## Requirements

### Requirement: Bitcoin treasury template is registered and discoverable

The system SHALL register a `bitcoin_treasury` model type in `TEMPLATES` with a
human label and description, so it appears in the web template picker, `GET /templates`,
and the MCP `list_templates` tool without any adapter-specific code.

#### Scenario: template appears in the registry
- **WHEN** a client lists available templates via the API or MCP
- **THEN** the response includes an entry with type `bitcoin_treasury`, a label, and a description

#### Scenario: creating from the template yields a valid model
- **WHEN** a model is created with type `bitcoin_treasury`
- **THEN** a `Model` is returned with `meta.type === 'bitcoin_treasury'` and it passes `validateModel` with no error-level issues

### Requirement: Treasury company identity is parameterized by ticker

The `bitcoin_treasury` template SHALL derive the modeled company's identity from a
`ticker` supplied through `CreateModelOptions`, rather than hardcoding any single
company. The `ticker` SHALL be **required** to create the template through the public
creation path (`createModel` and the API/MCP/web adapters over it): creating a
`bitcoin_treasury` with no non-empty ticker MUST fail with a clear, actionable error
that names the missing `ticker` parameter, rather than silently defaulting to a
placeholder. Templates SHALL declare whether they require a ticker (a `requiresTicker`
flag on the template registry entry) so the requirement is enforced generically and
non-ticker templates (`blank`, `saas`) remain ticker-free.

The price and market-cap line items MUST be named `${ticker_lowercased}_price` and
`${ticker_lowercased}_mcap`, and every internal reference to them — the common-share
dilution formula, the display-scale tagging, chart series references, and dashboard
widgets — MUST resolve to those names. Human-readable chart titles and series labels
MUST use the uppercased ticker, and MUST NOT hardcode a company's common or preferred
ticker (e.g. `ASST`, `SATA`).

The resolved ticker SHALL be stored on the model (`meta.ticker`) so adapters can
surface it. The UI SHALL display the ticker **uppercased** where it prefixes a line
item — stat tiles and statement/KPI rows for the price/market-cap items SHALL read
e.g. "MSTR price" / "MSTR mcap" rather than the lowercased item name.

#### Scenario: creating without a ticker is rejected
- **WHEN** a `bitcoin_treasury` model is created through `createModel` (or the API/MCP/web) with no ticker, or an empty/whitespace ticker
- **THEN** creation fails with a clear error naming the required `ticker` parameter, and no model is produced

#### Scenario: a supplied ticker names the items and is stored on the model
- **WHEN** a `bitcoin_treasury` model is created with `ticker: "MSTR"`
- **THEN** the model has items named `mstr_price` and `mstr_mcap`, the `new_shares` formula divides by `mstr_price`, the price/index charts and the headline stat widget reference `mstr_price`, and `meta.ticker` is `"MSTR"`

#### Scenario: the ticker is displayed uppercased in tiles and rows
- **WHEN** the dashboard stat tile or the KPI/statement row for the price or market-cap item is rendered for a model with `meta.ticker`
- **THEN** the displayed label reads the uppercased ticker prefix (e.g. "MSTR price", "MSTR mcap"), not the lowercased item name

#### Scenario: labels reflect the ticker and validate
- **WHEN** a `bitcoin_treasury` model is created with a given ticker
- **THEN** chart titles and series labels display the uppercased ticker, and the model passes `validateModel` with no dangling-reference errors

#### Scenario: non-ticker templates do not require a ticker
- **WHEN** a `blank` or `saas` model is created with no ticker
- **THEN** creation succeeds (those templates declare no ticker requirement)

#### Scenario: Strive is expressible, not assumed
- **WHEN** a `bitcoin_treasury` model is created with `ticker: "ASST"`
- **THEN** the price and market-cap items are named `asst_price` and `asst_mcap`, matching the template's prior naming

### Requirement: Template scaffolds the levered residual claim structure

The `bitcoin_treasury` builder SHALL emit drivers and formula items that model the
company's common equity as a levered residual claim on a crypto reserve. It MUST
include, at minimum: a reserve value (`btc_held * btc_price`), a perpetual-preferred
notional and its periodic dividend obligation, a **debt notional (straight plus
convertible)**, a cash balance, common shares outstanding, `nav_to_common = reserve +
cash + other_holdings - debt_notional - preferred_notional`, `nav_per_share`, an mNAV
multiple, a common price `${ticker}_price = max(nav_per_share, 0) * mnav`, a market
cap `${ticker}_mcap = ${ticker}_price * common_shares`, a **BTC-per-share accretion
metric `sats_per_share = btc_held * 100 / common_shares`** (sats per share, since
share counts are in millions), and `implied_leverage = reserve / nav_to_common`. The
`other_holdings` driver MUST represent only genuine holdings (e.g. STRC); debt MUST be
modeled through the dedicated debt line, not as a negative `other_holdings`.

#### Scenario: core outputs are present and computable
- **WHEN** the template model is computed for its base scenario
- **THEN** the computed series include reserve value, NAV-to-common, NAV per share, mNAV, price, sats-per-share, and implied leverage, each defined over every period

#### Scenario: common equity is levered to the reserve
- **WHEN** the reserve value rises while preferred notional is held fixed
- **THEN** `nav_per_share` rises by a larger percentage than the reserve (implied leverage > 1x)

#### Scenario: debt subtracts from common NAV
- **WHEN** the `debt_notional` driver is increased while all else is held fixed
- **THEN** `nav_to_common` and `nav_per_share` decrease by the added debt, and `other_holdings` is unaffected

#### Scenario: sats-per-share tracks BTC-per-share accretion
- **WHEN** the template model is computed for its base scenario
- **THEN** a `sats_per_share` series is present, equals `btc_held * 100 / common_shares` each period, and is finite (positive) over the horizon

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

### Requirement: Template ships with scenarios and a default dashboard

The template SHALL include a base scenario plus at least one alternate (e.g. a
drawdown/bear scenario overriding crypto price and issuance), and SHALL emit a
default dashboard laying out headline tiles, the projection table, and treasury
charts so the model is presentable immediately after creation. The default dashboard
SHALL include a chart plotting the `btc_price` series over time, so the BTC price path
that drives the model is visible directly. The default dashboard SHALL also surface
the **sats-per-share accretion metric** as a headline stat tile and as a line chart
tracking it over the horizon.

#### Scenario: alternate scenario is comparable
- **WHEN** the base and drawdown scenarios are compared for `asst_price`
- **THEN** `compare_scenarios` returns diverging series and the drawdown scenario shows lower prices in the affected periods

#### Scenario: default dashboard references valid series
- **WHEN** the template model is created
- **THEN** it includes a `dashboard` whose widgets reference charts and items that all resolve, and the model validates with no dangling-reference errors

#### Scenario: default dashboard plots BTC price over time
- **WHEN** a fresh `bitcoin_treasury` model is created
- **THEN** its charts include a chart whose series references `btc_price`, and a dashboard widget renders it

#### Scenario: default dashboard surfaces sats-per-share
- **WHEN** a fresh `bitcoin_treasury` model is created
- **THEN** its dashboard includes a stat tile referencing `sats_per_share` and a chart whose series references `sats_per_share`, both resolving with no dangling-reference errors

### Requirement: mNAV can follow a non-monotonic premium path

The bitcoin treasury template SHALL model the market premium (mNAV) as a
series-backed path rather than a strictly monotonic mean-reversion, so that a
cyclical / U-shaped premium history (e.g. 3.4× → 0.74× → 2.1× → ~0.95×) can be
represented and backtested. The mNAV SHALL be driven by a first-class series (a
driver or per-scenario series) that a user or agent can set to observed or assumed
values. The template MUST ship a default path so that, absent any override, the
model reproduces its prior behavior.

#### Scenario: an observed cyclical premium can be applied
- **WHEN** the mNAV series is set to a non-monotonic observed path
- **THEN** the model's mNAV follows that path period-by-period (rising and falling), and the modeled price reflects it

#### Scenario: default reproduces prior behavior
- **WHEN** a treasury model is created and the mNAV series is left at its default
- **THEN** the mNAV path matches the template's prior mean-reversion behavior

### Requirement: NAV-to-common stays economically sensible in deep drawdowns

The bitcoin treasury template SHALL provide a modeling path so that NAV-to-common
does not collapse the modeled equity value to zero merely because reserve value
approaches outstanding debt in a drawdown. Convertible instruments SHALL be
representable as **look-through equity** (excluded from senior claims, their
dilution carried in the share count) via an explicit, scenario-able assumption, so
that in a deep drawdown the common retains the option-like value it has in
reality rather than pricing to zero.

#### Scenario: converts treated as look-through equity keep NAV positive
- **WHEN** BTC reserve value falls to approximately the level of outstanding debt in a drawdown, with convertibles treated as look-through equity
- **THEN** NAV-to-common remains positive and the modeled share price does not collapse to zero

#### Scenario: the treatment is an explicit assumption
- **WHEN** a reader inspects the treasury model
- **THEN** whether convertibles are treated as look-through equity or face-value debt is an explicit, adjustable assumption, not a hidden default
