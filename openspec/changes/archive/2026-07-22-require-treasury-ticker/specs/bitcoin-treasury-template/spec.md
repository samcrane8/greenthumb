## MODIFIED Requirements

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
