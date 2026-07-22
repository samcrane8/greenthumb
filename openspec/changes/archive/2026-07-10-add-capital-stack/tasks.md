## 1. Types + analysis (core)

- [x] 1.1 Add `TrancheKind`, `Tranche` (`id`, `name`, `kind`, `seniority`, `notionalRef?`, `rate?`, `rateRef?`, `sharesRef?`, `conversionPrice?`, `convertAsEquity?`), and `CapitalStack` (`assetRefs: string[]`, `tranches: Tranche[]`) to `types.ts`; add optional `capitalStack?: CapitalStack` on `Model`
- [x] 1.2 Add `packages/core/src/capitalstack.ts` with `analyzeCapitalStack(model, scenario, options?)`: resolve refs to series (reuse the item-then-driver resolver pattern from `getChartData`), compute per period — asset value, seniority-ordered waterfall (claim/paid/recovery/claimsAhead), residual-to-common, NAV/share, coverage per tranche, blended cost of capital, implied leverage, diluted shares (in-the-money converts as equity)
- [x] 1.3 Handle convertibles: `convertAsEquity` excludes the tranche from claims and adds `notional/conversionPrice` diluted shares; else face-value claim at its seniority; pari-passu ties split pro-rata
- [x] 1.4 Export the types + `analyzeCapitalStack` + `CapitalStackAnalysis` from `index.ts`
- [x] 1.5 Unit tests: senior-before-junior recovery under shortfall; residual = assets − senior/preferred (floored); coverage rises with asset value; convert-as-equity dilutes vs. face-value; blended cost = Σ(claim·rate)/Σclaim

## 2. Operations + validation (core)

- [x] 2.1 `operations.ts`: `addTranche`, `updateTranche`, `removeTranche`, `setCapitalStackAssets` — validate-on-write, `OpResult` with change summary
- [x] 2.2 `validation.ts`: `DANGLING_STACK_REF` (asset/notional/rate/shares ref unresolved), `DUPLICATE_TRANCHE_ID`, `BAD_CAPITAL_STACK` (>1 common, or common without `sharesRef`); only when a stack is present
- [x] 2.3 Extend the rename cascade (`renameItem`/`renameDriver`) to rewrite matching capital-stack refs; confirm `removeItem`/`removeDriver` surface a dangling stack ref
- [x] 2.4 Tests: dangling ref → `ok:false`; duplicate/2-common rejected; rename updates a tranche ref + still validates; preview does not persist

## 3. Treasury default stack (core)

- [x] 3.1 In `bitcoinTreasuryModel`, emit `capitalStack` referencing existing series: `assetRefs: [reserve, cash, other_holdings]`; tranches senior_debt (seniority 10, notionalRef `senior_debt`), preferred (20, notionalRef `preferred_notional`, rateRef/`div_rate`), common (100, sharesRef `common_shares`)
- [x] 3.2 Test: fresh treasury model validates; analysis's `residualToCommon` ties out to the `nav_to_common` series within tolerance across periods and scenarios
- [x] 3.3 `pnpm --filter @greenthumb/core build` + `test` green

## 4. API adapter

- [x] 4.1 Routes: `POST/PATCH/DELETE /models/:id/capital-stack/tranches[/:trancheId]`, `PUT /models/:id/capital-stack/assets` (via `EditsController.#apply`), and `GET /models/:id/capital-stack/analysis?scenario=` (a controller read)
- [x] 4.2 API tests: add/update/remove tranche; dangling ref → 422; `?preview=true` no persist; analysis returns per-tranche + residual; treasury tie-out

## 5. MCP adapter

- [x] 5.1 Tools: `add_tranche`, `update_tranche`, `remove_tranche`, `set_capital_stack_assets`, `get_capital_stack_analysis` (call the API; change summary in text)
- [x] 5.2 Rebuild `packages/mcp`; live smoke (create treasury → get_capital_stack_analysis → confirm senior/preferred/common tranches + residual ties to nav_to_common; add a debt tranche; re-analyze) on an isolated port + store

## 6. Web — Capital Stack view

- [x] 6.1 `api.ts` methods for tranche CRUD, set-assets, and analysis
- [x] 6.2 A Capital Stack panel/view: ranked tranche table (kind, seniority, claim, coverage, recovery) + residual-to-common / NAV-per-share + a stacked claims-vs-asset-value bar (reuse recharts), scenario-aware
- [x] 6.3 Mount it (workspace panel or `/models` view); typecheck + web tests green

## 7. Verification & docs

- [x] 7.1 `pnpm typecheck` and all workspace tests green; production `vite build` succeeds
- [x] 7.2 End-to-end (isolated store): create treasury → view/analyze the stack → stress a drawdown scenario and confirm a junior tranche's recovery falls first
- [x] 7.3 Update `docs/Roadmap.md` to note the capital-stack capability and its waterfall analysis
