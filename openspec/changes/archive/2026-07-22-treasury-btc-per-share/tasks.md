## 1. Core: the KPI

- [x] 1.1 In `bitcoinTreasuryModel` (`packages/core/src/templates.ts`), add a KPI item `f("sats_per_share", "kpi", "count", "btc_held * 100 / common_shares", "equity")` near the other per-share items.
- [x] 1.2 Add `sats_per_share` to the display-scale tagging loop so it is tagged `scale = 1` (renders as a raw integer, not divided by the $millions default).

## 2. Core: dashboard

- [x] 2.1 In `attachTreasuryDashboard`, add a line chart `"Sats per share — accretion over time"` with a single series referencing `sats_per_share`; push it into `model.charts`.
- [x] 2.2 Swap the headline `btc_price` stat tile for a `sats_per_share` tile (btc_price keeps its full-width chart), and add a chart widget for the new sats chart; reflow widget `y` coordinates so nothing overlaps and the KPI statement table stays at the bottom.

## 3. Tests

- [x] 3.1 Update `treasury.test.ts`: the "core levered-residual outputs" list includes `sats_per_share`; the dashboard test's chart count moves from 5 to 6; assert a `sats_per_share` stat tile and a chart series referencing `sats_per_share` exist.
- [x] 3.2 Add a test: `sats_per_share` equals `btc_held * 100 / common_shares` each period and is finite/positive over the horizon.
- [x] 3.3 Update any other core test asserting the treasury dashboard chart count (e.g. `visualization.test.ts` "five charts") to the new count.
- [x] 3.4 Update `apps/api/tests/functional/charts.spec.ts` if it asserts a specific chart count for the treasury template.
- [x] 3.5 Rebuild core (`pnpm --filter @greenthumb/core build`) and run `pnpm --filter @greenthumb/core test`.

## 4. Verify

- [x] 4.1 `pnpm typecheck` across workspaces.
- [x] 4.2 Run core tests and `apps/api` functional tests.
- [x] 4.3 Live: create a treasury model via the API and confirm the returned model has a `sats_per_share` KPI (≈ btc_held·100/common_shares), a stat tile, and a chart referencing it, and that it validates with no error-level issues.
