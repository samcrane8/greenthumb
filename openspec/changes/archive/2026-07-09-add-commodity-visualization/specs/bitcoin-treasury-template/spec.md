## MODIFIED Requirements

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
