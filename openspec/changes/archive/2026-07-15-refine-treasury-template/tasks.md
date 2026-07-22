## 1. Core: ticker parameter and identity

- [x] 1.1 Add `ticker?: string` to `CreateModelOptions` in `packages/core/src/templates.ts`.
- [x] 1.2 In `bitcoinTreasuryModel`, normalize the ticker once: `const T = (options.ticker ?? "CO").trim()`, with `tickerUpper`/`tickerLower`, and derive `priceName = \`${tickerLower}_price\`` and `mcapName = \`${tickerLower}_mcap\``.
- [x] 1.3 Replace the `asst_price` item with `priceName` and the `asst_mcap` item with `mcapName`; update the `new_shares` formula divisor to reference `priceName`.
- [x] 1.4 Update the display-scale tagging loop (currently `it.name === "asst_price"`) to match `priceName`.
- [x] 1.5 In `attachTreasuryDashboard`, derive chart titles/series labels from `tickerUpper`, set the price/index chart series `ref`s to `priceName`, and set the headline stat widget `refId` to `priceName`. (Pass the resolved names/labels in, or read them off the model.)
- [x] 1.6 Generalize the `"SATA dividend coverage — raise vs. obligation"` chart title to `"Preferred dividend coverage — raise vs. obligation"`.

## 2. Core: uncapped preferred issuance

- [x] 2.1 Remove the `amplification_cap` driver from the `bitcoinTreasuryModel` driver list.
- [x] 2.2 Change the `preferred_raise` formula from the `clamp(..., amplification_cap * reserve - prev_preferred)` expression to `max(0, preferred_raise_target)` (S-curve ramp, floored at zero, uncapped).
- [x] 2.3 Update the surrounding comments/doc-comment that describe the cap so they match the uncapped behavior.

## 3. Core tests

- [x] 3.1 Update `packages/core/src/treasury.test.ts` and `packages/core/src/visualization.test.ts` to create the model with `ticker: "ASST"` where they rely on `asst_price` (or otherwise resolve the price item by the ticker).
- [x] 3.2 Add a test asserting a non-default ticker (`ticker: "MSTR"`) yields items `mstr_price`/`mstr_mcap`, a `new_shares` divisor of `mstr_price`, chart/widget refs to `mstr_price`, no `ASST`/`SATA` in any chart title/label, and a model that validates.
- [x] 3.3 Add a test asserting the default (no ticker) yields `co_price`/`co_mcap` and no `ASST`/`SATA` labels.
- [x] 3.4 Add a test asserting `preferred_notional` is non-decreasing and exceeds `amplification_cap`-era ceilings in later periods (uncapped growth).
- [x] 3.5 Rebuild core: `pnpm --filter @greenthumb/core build`; run `pnpm --filter @greenthumb/core test`.

## 4. Adapters: expose the ticker

- [x] 4.1 API: extend the `store` request body type in `apps/api/app/controllers/models_controller.ts` with `ticker?: string` and pass it into `createModel({ ..., ticker })`.
- [x] 4.2 Web: add `ticker?: string` to the `createModel` input type in `apps/web/src/lib/api.ts`.
- [x] 4.3 Web: thread `ticker` through `WorkspaceContext.createModel` in `apps/web/src/workspace/WorkspaceContext.tsx` (let core apply the `"CO"` default).
- [x] 4.4 MCP: add an optional `ticker` to the scaffold tool's input schema in `packages/mcp/src/index.ts`, forwarded to the create call.
- [x] 4.5 Update `apps/api/tests/functional/charts.spec.ts` to create its treasury model with `ticker: "ASST"` (or resolve by ticker) so its `asst_price` lookups still hold.

## 5. Verify

- [x] 5.1 `pnpm typecheck` across workspaces.
- [x] 5.2 Run the affected suites: core tests and `apps/api` functional tests.
- [x] 5.3 Create a treasury model via the API with a non-default ticker and confirm the returned model's item names, chart labels, and dashboard widget reflect it and that it validates with no error-level issues.
