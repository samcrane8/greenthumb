## Context

`bitcoinTreasuryModel` in `packages/core/src/templates.ts` emits `btc_held` (KPI,
count — actual BTC on the treasury) and `common_shares` (KPI, count — shares in
**millions**), but no per-share crypto figure. `attachTreasuryDashboard` builds five
charts and a dashboard with a 4-tile headline row (asst/ticker price, btc_price,
btc_held, implied_leverage), the five charts, and a KPI statement table.

BTC-per-share is the metric that shows whether issuance is accretive. Because shares
are in millions, literal BTC/share (`btc_held / (common_shares * 1e6)`) is ~0.0002 —
unreadable. Sats/share (`btc_held * 100 / common_shares`) is a legible integer that
rises as the treasury accretes BTC faster than it dilutes.

## Goals / Non-Goals

**Goals:**
- Add `sats_per_share` as a default KPI and track it on the dashboard (tile + chart).
- Render it as a raw integer, not scaled by the model's $millions default.

**Non-Goals:**
- A literal BTC/share decimal, a BTC-yield (accretion %) metric, or any adapter change.

## Decisions

### `sats_per_share = btc_held * 100 / common_shares`, unit `count`, section `equity`
Derivation: BTC/share = `btc_held / (common_shares * 1e6)`; sats/share = that × 1e8 =
`btc_held * 100 / common_shares`. It's a per-share metric, so it lives in the `equity`
section next to `nav_per_share`. `common_shares ≥ shares_start > 0` every period, so no
divide-by-zero. Unit `count` (sats are a count; there is no dedicated sats unit).
- *Alternative rejected — literal BTC/share:* the user chose sats/share for legibility.

### Display scale = 1
The template sets `meta.defaultScale = 1_000_000` for currency and tags per-share
dollar items (`nav_per_share`, `${ticker}_price`) with `scale = 1`. `sats_per_share` is
a `count`, but to be safe against any count-scaling it is added to the same scale-1
tagging loop so it always renders as a raw integer (~21,780), never divided down.

### Dashboard: promote sats-per-share to the headline, add a trend chart
The current top row has four tiles including a `btc_price` tile — which is redundant
with the full-width `btc_price` chart directly beneath it. Swap that tile for a
`sats_per_share` tile so the headline row stays a clean four across (12 cols) and leads
with the accretion metric; `btc_price` remains fully visible via its chart. Add a line
chart "Sats per share — accretion over time" (series → `sats_per_share`) to
`model.charts`, and a chart widget for it, reflowing the widget grid's y-coordinates so
nothing overlaps and the KPI statement table stays at the bottom.
- *Alternative rejected — five tiles across:* 5 × w3 = 15 > 12 cols, so the fifth wraps
  to a sparse second row. Swapping the redundant `btc_price` tile keeps one clean row.

## Risks / Trade-offs

- [A test asserts the dashboard has exactly five charts] → It becomes six; update that
  assertion. Any test asserting the specific top-row tiles must account for the
  `btc_price`→`sats_per_share` tile swap.
- [Dropping the `btc_price` tile surprises someone who liked it] → `btc_price` keeps its
  dedicated full-width chart (the more useful view of a path); only the redundant tile
  moves. Documented here.
- [Very large late-horizon share counts shrink sats/share] → That is the accretion
  signal itself (dilution vs. BTC growth); no special handling needed.

## Migration Plan

- Additive to the template output; no type or adapter changes. Rebuild core before the
  API (runtime import). Existing saved models are untouched (they keep their items and
  dashboard); only new creations get the KPI.
- Rollback: revert the template edits; nothing persisted depends on it.
