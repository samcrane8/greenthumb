## MODIFIED Requirements

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
