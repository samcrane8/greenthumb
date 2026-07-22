## Context

The `refine-treasury-template` change made the treasury company's ticker a
parameter (`CreateModelOptions.ticker`, default `CO`) that names the price/mcap
items and labels charts. But supplying it is optional and easy to skip: the MCP
`create_model` tool marks `ticker` optional (an AI omitted it → `CO`), and the web
picker (`Sidebar.tsx`) creates in one click with no ticker field (always `CO`).
The dashboard tile also renders the raw item name (`mstr_price` → "mstr price").

All adapters create models through core's `createModel(options)` dispatcher
(API `models_controller.store` → `createModel`; MCP and web call that API). So the
requirement can be enforced once in `createModel`, and the display fix keys off a
new `meta.ticker` the template stores.

## Goals / Non-Goals

**Goals:**
- Make a ticker mandatory to create a `bitcoin_treasury` on the public path, with a
  clear error, enforced in core so every adapter inherits it.
- Store the ticker on the model and display it uppercased in tiles/rows.
- Keep `blank`/`saas` ticker-free; keep the low-level builder usable in tests.

**Non-Goals:**
- Requiring tickers elsewhere, a company registry, or item renames on saved models.
- Reworking chart titles (already uppercased) or the formula/engine layer.

## Decisions

### Enforce at the `createModel` boundary, keyed by `TemplateInfo.requiresTicker`
Add `requiresTicker?: boolean` to `TemplateInfo` and set it `true` for the
`bitcoin_treasury` entry. In `createModel(options)`, after resolving the template,
throw a clear `Error` when `template.requiresTicker` and `options.ticker` is missing
or blank: `The "Bitcoin Treasury" template requires a \`ticker\` (the company being
modeled, e.g. "MSTR").` This is generic (no hardcoded template id), and every adapter
that goes through `createModel` inherits it.
- *Alternative rejected — throw inside `bitcoinTreasuryModel`:* the builder is called
  directly by ~30 core tests with no ticker; hard-failing there would break them and
  couples enforcement to one template. Keeping the builder's `CO` default and
  enforcing at the dispatcher cleanly separates "public creation" (strict) from
  "direct builder" (permissive, for tests/internal use).

### Store `meta.ticker`
Add `ticker?: string` to `ModelMeta`. `bitcoinTreasuryModel` sets
`model.meta.ticker = tickerUpper`. This is the single source the UI reads to know the
company identity and which item-name prefix to uppercase. Presentation-only, so it
carries no engine/validation weight.

### Display: uppercase the ticker prefix
A small shared web helper `displayItemLabel(model, itemName)`: if `meta.ticker` is set
and `itemName` starts with `${ticker.toLowerCase()}_`, render
`${TICKER} ${rest.replace(/_/g, " ")}`; otherwise the current `name.replace(/_/g, " ")`.
Apply it in the dashboard `StatWidget` and the statement/KPI table row labels. Falls
back gracefully for saved models without `meta.ticker`.

### Adapters
- **API:** wrap `createModel(...)` in `store` in try/catch → `badRequest({ error })`
  with the thrown message (a creation-parameter error, not a model-validation issue,
  so it does not go through the `{ model, issues }` path).
- **MCP:** update the `create_model` tool description to state `ticker` is required
  for ticker-aware templates (e.g. bitcoin_treasury) with an example; the API error
  is the backstop the model sees if it still omits it.
- **Web:** surface `requiresTicker` on the `TemplateInfo` the picker consumes; when a
  ticker-aware template button is clicked, open a small dialog prompting for the
  ticker (required, non-empty) and pass it to `createModel(type, label, ticker)`. Non-
  ticker templates keep the current one-click behavior.

## Risks / Trade-offs

- [Existing callers/tests that create a treasury via the API without a ticker break]
  → Intended: the API now 4xx's without a ticker. In-repo tests (`charts.spec.ts`)
  already pass `ticker: "ASST"`; add a test asserting the 4xx. The core builder keeps
  its `CO` default so unit tests calling `bitcoinTreasuryModel` directly are unaffected.
- [Saved `CO` models show no uppercased ticker] → Acceptable: no `meta.ticker`, so the
  helper falls back to the current rendering. No migration performed.
- [A ticker with characters illegal in a formula reference] → Same as the prior change;
  `trim()` + case-fold cover the common cases and references are generated from the
  normalized string. Out of scope to sanitize aggressively.

## Migration Plan

- Additive types (`meta.ticker`, `requiresTicker` both optional). The only breaking
  behavior is the intended creation-time requirement.
- Rebuild core before running the API (API imports core at runtime).
- Rollback: revert the change; saved models are unaffected (fetch/display and creation
  only).
