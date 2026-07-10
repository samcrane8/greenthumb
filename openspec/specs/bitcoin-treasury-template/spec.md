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

### Requirement: Template scaffolds the levered residual claim structure

The `bitcoin_treasury` builder SHALL emit drivers and formula items that model the
company's common equity as a levered residual claim on a crypto reserve. It MUST
include, at minimum: a reserve value (`btc_held * btc_price`), a perpetual-preferred
notional and its periodic dividend obligation, a **debt notional (straight plus
convertible)**, a cash balance, common shares outstanding, `nav_to_common = reserve +
cash + other_holdings - debt_notional - preferred_notional`, `nav_per_share`, an mNAV
multiple, `asst_price = max(nav_per_share, 0) * mnav`, and `implied_leverage = reserve
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
price series, preferred issuance pace, preferred dividend rate, common ATM issuance, an
amplification cap on preferred relative to reserve, and an mNAV target — so a human or
Claude can tune the model via `set_assumption`/scenarios rather than editing formulas.
The crypto price driver (`btc_price`) SHALL be a **commodity-priced driver bound to the
Bitcoin power-law model** (trend plus halving-cycle oscillation), spot-anchored to the
template's starting spot, rather than a constant-rate compounding path; formulas reference
it by name so the reserve build is unchanged.

#### Scenario: adjusting an assumption changes outputs
- **WHEN** the preferred dividend-rate driver is increased via `set_assumption`
- **THEN** the recomputed dividend obligation increases and dividend coverage decreases, with the write validating successfully

#### Scenario: issuance ramp uses an S-curve
- **WHEN** the preferred issuance series is defined via the `scurve`/`logistic` primitives over the ramp assumption
- **THEN** issuance starts near the configured start pace and ramps toward the peak pace over the ramp horizon

#### Scenario: BTC price follows the power law with oscillation
- **WHEN** a fresh `bitcoin_treasury` model is created and computed
- **THEN** the `btc_price` driver's series is the spot-anchored Bitcoin power law (period 0 at the starting spot, then arcing up through fair value and back per the halving-cycle oscillation), not a constant-growth line

### Requirement: Template ships with scenarios and a default dashboard

The template SHALL include a base scenario plus at least one alternate (e.g. a
drawdown/bear scenario overriding crypto price and issuance), and SHALL emit a
default dashboard laying out headline tiles, the projection table, and treasury
charts so the model is presentable immediately after creation. The default dashboard
SHALL include a chart plotting the `btc_price` series over time, so the BTC price path
that drives the model is visible directly.

#### Scenario: alternate scenario is comparable
- **WHEN** the base and drawdown scenarios are compared for `asst_price`
- **THEN** `compare_scenarios` returns diverging series and the drawdown scenario shows lower prices in the affected periods

#### Scenario: default dashboard references valid series
- **WHEN** the template model is created
- **THEN** it includes a `dashboard` whose widgets reference charts and items that all resolve, and the model validates with no dangling-reference errors

#### Scenario: default dashboard plots BTC price over time
- **WHEN** a fresh `bitcoin_treasury` model is created
- **THEN** its charts include a chart whose series references `btc_price`, and a dashboard widget renders it

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
