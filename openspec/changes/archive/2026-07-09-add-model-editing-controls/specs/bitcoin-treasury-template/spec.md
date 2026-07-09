## MODIFIED Requirements

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
