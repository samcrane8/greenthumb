## ADDED Requirements

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
notional and its periodic dividend obligation, a cash balance, common shares
outstanding, `nav_to_common = reserve + cash + other_holdings - preferred_notional`,
`nav_per_share`, an mNAV multiple, `asst_price = max(nav_per_share, 0) * mnav`, and
`implied_leverage = reserve / nav_to_common`.

#### Scenario: core outputs are present and computable
- **WHEN** the template model is computed for its base scenario
- **THEN** the computed series include reserve value, NAV-to-common, NAV per share, mNAV, price, and implied leverage, each defined over every period

#### Scenario: common equity is levered to the reserve
- **WHEN** the reserve value rises while preferred notional is held fixed
- **THEN** `nav_per_share` rises by a larger percentage than the reserve (implied leverage > 1x)

### Requirement: Template exposes tunable assumptions as drivers

The template SHALL express its key assumptions as drivers — including at least crypto
price trajectory, preferred issuance pace, preferred dividend rate, common ATM
issuance, an amplification cap on preferred relative to reserve, and an mNAV target —
so a human or Claude can tune the model via `set_assumption`/scenarios rather than
editing formulas.

#### Scenario: adjusting an assumption changes outputs
- **WHEN** the preferred dividend-rate driver is increased via `set_assumption`
- **THEN** the recomputed dividend obligation increases and dividend coverage decreases, with the write validating successfully

#### Scenario: issuance ramp uses an S-curve
- **WHEN** the preferred issuance series is defined via the `scurve`/`logistic` primitives over the ramp assumption
- **THEN** issuance starts near the configured start pace and ramps toward the peak pace over the ramp horizon

### Requirement: Template ships with scenarios and a default dashboard

The template SHALL include a base scenario plus at least one alternate (e.g. a
drawdown/bear scenario overriding crypto price and issuance), and SHALL emit a
default dashboard laying out headline tiles, the projection table, and treasury
charts so the model is presentable immediately after creation.

#### Scenario: alternate scenario is comparable
- **WHEN** the base and drawdown scenarios are compared for `asst_price`
- **THEN** `compare_scenarios` returns diverging series and the drawdown scenario shows lower prices in the affected periods

#### Scenario: default dashboard references valid series
- **WHEN** the template model is created
- **THEN** it includes a `dashboard` whose widgets reference charts and items that all resolve, and the model validates with no dangling-reference errors
