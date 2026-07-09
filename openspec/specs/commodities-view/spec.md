# commodities-view Specification

## Purpose

Provide a read-only Commodities view in the web app, backed by a price-model preview
read on the API, so users can explore every registered commodity, its price models,
and each model's default parameters — including an interactive preview chart of the
generated price path — without any ability to edit the registry.

## Requirements

### Requirement: Price-model preview read

The API SHALL provide a read that generates a sample price series for a commodity's
price model over a default timeline, with optional query overrides (period count,
granularity, and model params such as spot/band). It MUST return the generated series
with per-period labels, and MUST respond 404 for an unknown commodity or model. It is
read-only and generates via the core registry (no duplicated price logic in an adapter).

#### Scenario: preview returns a generated series
- **WHEN** a client requests the Bitcoin power-law preview
- **THEN** the response contains a series of finite prices with one label per period

#### Scenario: overrides shape the preview
- **WHEN** the preview is requested with a `spot` override
- **THEN** the first period of the returned series equals that spot

#### Scenario: unknown model is not found
- **WHEN** a preview is requested for a commodity or model id that is not registered
- **THEN** the API responds 404

### Requirement: Commodities view in the web app

The web app SHALL provide a read-only view, reachable from the sidebar navigation,
that lists every registered commodity, each of its price models, and that model's
default parameters. For each model it SHALL render a preview chart of the generated
price path. The view MUST NOT offer any editing of the registry.

#### Scenario: commodities are listed with their models and params
- **WHEN** the user opens the Commodities view
- **THEN** each registered commodity is shown with its price models and their default parameters

#### Scenario: each model shows a price-path preview
- **WHEN** the Commodities view renders the Bitcoin power-law model
- **THEN** it displays a chart of the previewed price path (the power-law trend with its halving-cycle oscillation)

#### Scenario: the preview is interactive
- **WHEN** the user adjusts a price-model parameter control (e.g. spot, band, amplitude, or cycle length)
- **THEN** the preview chart re-renders from the model regenerated with the adjusted parameter

#### Scenario: the view is read-only
- **WHEN** the user views a commodity and its models
- **THEN** exploring parameters never changes the registry's stored defaults, and no control to edit, add, or remove commodities or models is presented

### Requirement: Commodities view is reachable via navigation

The Commodities view SHALL be an addressable route with a persistent sidebar entry, so
it is reachable from anywhere in the app without disturbing existing navigation.

#### Scenario: sidebar navigates to the commodities view
- **WHEN** the user clicks the Commodities entry in the sidebar
- **THEN** the app navigates to the commodities route and renders the view
