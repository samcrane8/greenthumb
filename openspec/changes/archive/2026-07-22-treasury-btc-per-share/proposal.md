## Why

BTC-per-share is the headline accretion metric for a Bitcoin treasury company — it
shows how much crypto each common share represents and whether capital raises are
accretive (issuing shares to buy BTC should grow BTC-per-share over time). The
template models `btc_held` and `common_shares` but never derives the per-share
figure, so the one number the strategy is judged on isn't tracked by default.

## What Changes

- Add a default KPI `sats_per_share = btc_held * 100 / common_shares` to the
  `bitcoin_treasury` template. Expressed in **sats per share** (1 BTC = 100M sats)
  because the model's share count is in millions, so raw BTC/share is an unreadable
  small decimal; sats/share is a legible integer (~21,780 at the Strive start) that
  grows with accretive issuance.
- Surface it in the default dashboard: a headline **stat tile** and a **line chart**
  tracking sats-per-share over the horizon (the accretion story), plus its presence
  as a row in the KPI/quarterly table.
- Tag its display scale so it renders as a raw integer (not divided by the model's
  $millions default scale).

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `bitcoin-treasury-template`: the template now emits a default sats-per-share KPI
  and surfaces it in the default dashboard (tile + trend chart).

## Impact

- **Layer (core first):** `packages/core/src/templates.ts` — add the `sats_per_share`
  formula item, add it to the display-scale tagging, and extend
  `attachTreasuryDashboard` with a stat tile and a line chart (reflowing the dashboard
  layout to fit). No engine/type changes; no adapter changes (the API/MCP/web serve
  whatever the template emits).
- **Integrity:** no balance/tie-out/validation impact — it's a derived KPI. It divides
  by `common_shares`, which is ≥ `shares_start > 0` every period, so no divide-by-zero.
- **Back-compat:** additive. Existing saved models are unchanged; only newly created
  treasury models include the KPI. The KPI count of the default dashboard grows by one
  chart (tests asserting "five charts" must move to six).

## Non-goals

- Not adding a literal BTC-per-share decimal alongside sats/share (sats/share chosen
  for legibility); can be added later if wanted.
- Not modeling a "BTC yield" (period-over-period accretion %) metric — just the level.
- Not rebuilding Excel (PRD §3); this is one derived KPI + its default presentation.
