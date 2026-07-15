## Why

The `bitcoin_treasury` template can now be labeled with any company's ticker, but
supplying it is easy to miss: the MCP `create_model` tool takes `ticker` as an
*optional* parameter (so an AI omitted it and the model silently rendered as the
neutral `CO`), and the web template picker has **no ticker field at all** (one-click
create always yields `CO`). The result: a Strive/MSTR/etc. treasury model that shows
`CO` everywhere. The ticker should be required for this template and should display
as the proper, uppercased ticker in the UI.

## What Changes

- **BREAKING (creation contract):** creating a `bitcoin_treasury` through the public
  path (`createModel` → API/MCP/web) now REQUIRES a non-empty `ticker`. Omitting it
  fails with a clear, actionable error instead of defaulting to `CO`. `blank`/`saas`
  are unaffected (they take no ticker).
- Templates declare whether they need a ticker via a new `requiresTicker` flag on
  `TemplateInfo`, so `createModel` enforces it generically and adapters can adapt
  their UI/validation without hardcoding template ids.
- The resolved ticker is stored on the model (`meta.ticker`) so the UI can surface
  it. Stat tiles and KPI/statement rows display the **uppercased** ticker (e.g.
  "MSTR price", "MSTR mcap") instead of the lowercased item name ("mstr price").
  Chart titles/labels already use the uppercased ticker.
- The MCP `create_model` tool documents `ticker` as required for ticker-aware
  templates; the API returns a clear error when it's missing; the web picker prompts
  for the ticker before creating a ticker-aware template.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `bitcoin-treasury-template`: the company ticker becomes **required** to create the
  template (no silent `CO` fallback on the public path), is stored on the model, and
  is surfaced uppercased in the dashboard tiles and statement rows.

## Impact

- **Layer order (core first):** `packages/core` — add `ticker?` to `ModelMeta`
  (`types.ts`); add `requiresTicker` to `TemplateInfo` and enforce it in
  `createModel`; store `meta.ticker` in `bitcoinTreasuryModel` (`templates.ts`). Then
  adapters: the API `store` endpoint catches the creation error → clear 4xx
  (`models_controller.ts`); the MCP `create_model` description marks `ticker`
  required for ticker-aware templates (`packages/mcp/src/index.ts`); the web api
  client/`TemplateInfo` expose `requiresTicker`, the Sidebar prompts for a ticker,
  and the dashboard/statement views uppercase the ticker prefix from `meta.ticker`
  (`apps/web`).
- **Integrity:** no change to balance/tie-out/validation. A missing ticker is a
  creation-parameter error (thrown before a model exists), not a model-validation
  issue — the `{ model, issues, ok }` mutation contract is untouched.
- **Back-compat:** existing saved treasury models are unaffected — they keep their
  item names and simply have no `meta.ticker` (the UI falls back to the current
  lowercased rendering). Only new creations require a ticker. The low-level
  `bitcoinTreasuryModel(...)` builder keeps its `CO` default for direct/test use;
  enforcement lives at the public `createModel` boundary.

## Non-goals

- Not requiring tickers for non-treasury templates, and not building a company
  registry or auto-populating starting figures from the ticker.
- Not renaming items on existing models or migrating historical `CO` models.
- Not rebuilding Excel (PRD §3): the ticker remains an identity/label parameter.
