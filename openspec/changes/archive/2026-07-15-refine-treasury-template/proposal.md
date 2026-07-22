## Why

The `bitcoin_treasury` template hardcodes Strive's identity — the ticker `ASST`
(and its preferred ticker `SATA`) is baked into line-item names, formula
references, chart titles, and a dashboard widget — so a treasury model created to
investigate any other company (MSTR, Metaplanet, …) is still mislabeled `ASST`.
Separately, preferred issuance is clamped so notional can never exceed
`amplification_cap × reserve`; in reality a treasury keeps raising perpetual
preferred over time, so the cap understates the levered claim's growth. Both are
edits to the same template function; we refine them together.

## What Changes

- Add an optional `ticker` to `CreateModelOptions` (core), defaulting to a neutral
  `"CO"` when omitted — never silently attributing a model to Strive.
- Derive the treasury template's identity from the ticker: item names become
  `${ticker_lower}_price` / `${ticker_lower}_mcap` (Strive still yields
  `asst_price`), and every string reference to them — the `new_shares` formula,
  the scale-tagging loop, chart series refs, and the dashboard stat widget —
  derives from the same ticker.
- Chart titles and series labels use the uppercased ticker; generalize the
  `SATA dividend coverage` chart title so it is no longer Strive-specific (e.g.
  `Preferred dividend coverage`).
- **BREAKING** (template output only): remove the `amplification_cap` ceiling on
  preferred issuance so `preferred_raise` follows the S-curve ramp unbounded and
  `preferred_notional` grows over time. The `amplification_cap` driver is
  retired from the template.
- Thread `ticker` through the adapters after core: the API `POST /api/models`
  store endpoint, the web api client, `WorkspaceContext.createModel`, and the MCP
  scaffold tool.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `bitcoin-treasury-template`: the template's identity (item names, references,
  chart/label strings) becomes parameterized by a `ticker` instead of hardcoded
  to `ASST`/`SATA`; and preferred issuance is no longer capped at
  `amplification_cap × reserve` — notional grows over the horizon.

## Impact

- **Layer order (per architecture rule):** `packages/core` changes first —
  `CreateModelOptions`, `bitcoinTreasuryModel`, and `attachTreasuryDashboard` in
  `packages/core/src/templates.ts`. Then the adapters expose it:
  `apps/api/app/controllers/models_controller.ts` (store body → options),
  `apps/web/src/lib/api.ts` (create input), `apps/web/src/workspace/WorkspaceContext.tsx`
  (createModel), and `packages/mcp/src/index.ts` (scaffold tool input).
- **Tests:** `packages/core/src/treasury.test.ts`,
  `packages/core/src/visualization.test.ts`, and
  `apps/api/tests/functional/charts.spec.ts` reference `asst_price` — they keep
  passing under the default ticker, and gain coverage for a non-default ticker and
  for uncapped preferred growth.
- **Integrity:** no change to the balance / tie-out invariants. Removing the
  preferred cap can drive `nav_to_common` toward or below zero in later periods;
  the existing `implied_leverage` sentinel (`nav_to_common <= 0 → 99`) already
  handles that, and the capital-stack residual continues to tie to `nav_to_common`.

## Non-goals

- The Strive-specific **starting balance-sheet values** (16,500 BTC, $576M
  preferred, $93M cash, 75.77M shares, from the May-2026 8-K) remain the template
  defaults — only the ticker/labeling and the preferred cap change. Seeding a
  different company's actuals is out of scope.
- Not adding per-company presets, a company registry, or market-data-driven
  auto-population of starting figures.
- Not rebuilding Excel (PRD §3): the ticker is a label/identity parameter, not a
  new modeling primitive.
