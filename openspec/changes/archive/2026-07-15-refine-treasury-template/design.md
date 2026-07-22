## Context

`bitcoinTreasuryModel` in `packages/core/src/templates.ts` is the single builder
for the `bitcoin_treasury` template. Today it hardcodes Strive's identity — the
item names `asst_price` / `asst_mcap`, the `new_shares` formula's divisor, the
`scale`-tagging loop's name match, chart titles/labels, and a dashboard stat
widget's `refId` all reference the literal `ASST` (and one chart title references
Strive's preferred ticker `SATA`). `CreateModelOptions` carries only
`name`/`type`/`baseCurrency`/`timeline`, so there is no way to make the identity
anything but ASST. Preferred issuance is also clamped: `preferred_raise` is
`clamp(target, 0, max(0, amplification_cap * reserve - prev_preferred))`, so
notional can never exceed `amplification_cap × reserve`.

The architecture rule (`packages/core` is the single source of truth) means the
`ticker` parameter and the uncapped-issuance formula land in the template first,
then the API / web / MCP adapters just forward the new field. Formula references
are by item **name**, so the price/mcap items and every string that references
them must be derived from one computed ticker so they stay in sync.

## Goals / Non-Goals

**Goals:**
- One `ticker` input drives the treasury company's identity end-to-end; default
  `"CO"` when omitted, never silently `ASST`.
- Price/mcap item names, their references, chart strings, and the dashboard
  widget all derive from that ticker with no remaining `ASST`/`SATA` literals.
- Preferred issuance follows the S-curve ramp uncapped; `preferred_notional`
  grows over the horizon.
- Default ticker + existing tests continue to pass (Strive still → `asst_price`
  when `ticker: "ASST"`).

**Non-Goals:**
- Changing the Strive-specific starting driver values (BTC/preferred/cash/shares).
- A company registry, per-ticker presets, or market-data auto-population.
- Reworking the mNAV, capital-stack, or scenario machinery beyond what the cap
  removal touches.

## Decisions

### Ticker as a `CreateModelOptions` field, normalized once in the builder
Add `ticker?: string` to `CreateModelOptions`. Inside `bitcoinTreasuryModel`,
compute `const T = (options.ticker ?? "CO").trim()`, then `tickerUpper =
T.toUpperCase()` (labels/titles) and `tickerLower = T.toLowerCase()` (item names).
Build the two item names once —
`const priceName = \`${tickerLower}_price\``, `const mcapName =
\`${tickerLower}_mcap\`` — and reference those constants everywhere (the
`new_shares` formula string, the two item definitions, the scale loop match, the
chart series `ref`s, and the dashboard stat widget `refId`). This keeps every
by-name reference sourced from one value, so they cannot drift.
- *Alternative rejected — generic stable names (`share_price`/`market_cap`) with
  ticker only in labels:* cleaner internally but the user chose ticker-based
  names so the KPI table rows read as the company's ticker; and it would rename
  the item the default case has always emitted (`asst_price`), breaking more.

### Default `"CO"`, not `"ASST"`
Omitting the ticker yields `co_price`/`co_mcap` and `CO`-labeled charts — a
neutral placeholder. The starting balance-sheet numbers remain Strive's actuals
(a documented non-goal), but nothing in the *labeling* asserts the model is
Strive unless the caller passes `ticker: "ASST"`.

### Generalize the `SATA` chart title
The preferred-coverage chart title `"SATA dividend coverage — raise vs.
obligation"` becomes `"Preferred dividend coverage — raise vs. obligation"` —
company-neutral, since the preferred ticker is not parameterized (only the common
ticker is) and the chart is about the preferred line generically.

### Remove the amplification cap; drop the `amplification_cap` driver
`preferred_raise` becomes `max(0, preferred_raise_target)` (S-curve ramp, floored
at zero, no upper clamp), and the `amplification_cap` driver is removed from the
template's driver list and from the `clamp(...)` expression. `preferred_notional`
still accumulates as `prev_preferred + preferred_raise`, so it is non-decreasing
and grows unbounded with the ramp. Retiring the driver (rather than leaving it
unreferenced) avoids a dangling assumption in the UI.

### Adapters forward the field, no logic
- API: extend the `store` request body type with `ticker?: string` and pass it
  into `createModel({ ..., ticker })`.
- Web: add `ticker?` to the `api.createModel` input type and to
  `WorkspaceContext.createModel`, defaulting nothing (let core apply `"CO"`).
- MCP: add an optional `ticker` to the scaffold tool's input schema, forwarded to
  the create call.
Each adapter only threads the value; no model logic is duplicated.

## Risks / Trade-offs

- [Removing the cap can drive `nav_to_common` ≤ 0 in later periods as preferred
  outgrows reserve] → Intended per the user; the existing `implied_leverage`
  sentinel (`nav_to_common <= 0 → 99`) already guards divide-by-zero, and
  `nav_per_share`/price already floor at 0 via `max(nav_per_share, 0)`. The
  capital-stack residual continues to tie to `nav_to_common`.
- [Existing tests/fixtures reference `asst_price`] → They pass `ticker: "ASST"`
  (or rely on the builder being called with it) and keep matching `asst_price`;
  new tests assert a non-default ticker (`mstr_price`) and uncapped preferred
  growth. Saved model JSON fixtures on disk are unaffected (they carry their own
  item names).
- [A caller passes a ticker with characters illegal in a formula reference (e.g.
  a dot or space)] → Normalize by trimming; document that ticker should be an
  alphanumeric symbol. Out of scope to sanitize aggressively, but the `trim()`
  and case-fold cover the common cases; the model still validates because
  references are generated from the same normalized string.

## Migration Plan

- Pure additive on the adapter surface (`ticker` is optional everywhere), so no
  client is broken by omission.
- Rebuild core (`pnpm --filter @greenthumb/core build`) before running the API,
  per repo convention, since the API imports core at runtime.
- Rollback is reverting the change; already-saved models are unaffected because
  they store their own resolved item names and drivers.
