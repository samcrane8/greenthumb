## 1. Timeline start date (#3)

- [x] 1.1 Core: add `setTimelineStart(model, startISO)` op in `operations.ts` — set `timeline.start`, call `regenerateBoundDrivers`, `finalize` with a `ChangeSummary`
- [x] 1.2 Core: export it; unit test (start changes; bound commodity driver regenerates; validates)
- [x] 1.3 API: add `start` to `POST /models` create body; add `PUT /models/:id/timeline` handling of a `start` field (or a dedicated route) via EditsController
- [x] 1.4 MCP: add `start` param to `create_model` and `set_timeline` tools
- [x] 1.5 Verify labels: a model created with `start=2020-07-01`, quarterly, shows Q3-2020-based labels

## 2. Lean MCP responses (#8)

- [x] 2.1 MCP: add a shared `responseArg = { full: z.boolean().default(false) }`; mutating tools send `summary: String(!full)` on the query (API already honors `?summary=true`)
- [x] 2.2 Keep `changeText(...)` working off the lean response; ensure preview/override still function
- [x] 2.3 Confirm the API default (full model) is unchanged for the web app
- [x] 2.4 Spot-check payload size drops on a mutating tool call

## 3. Currency scale + unit display (#9)

- [x] 3.1 Core: add optional `scale?: number` to `LineItem` and `Driver` (and optional `ModelMeta.defaultScale`) in `types.ts`; document it as display-only metadata
- [x] 3.2 Core: ensure `scale` is inert to computation and validation (no calc/identity change); add a test asserting compute is identical with/without scale
- [x] 3.3 Web: `formatNumber(value, unit, scale?)` multiplies by the effective scale before compacting to $/K/M/B; resolve effective scale (item → model default → 1)
- [x] 3.4 Web: annotate the statement grid + stat tiles with a unit/scale hint; confirm percent renders decimals as `%` (0.105 → 10.5%)
- [x] 3.5 Template: set `scale` explicitly on `bitcoin_treasury` currency items ($M → 1e6) and leave `btc_price` at 1; verify `reserve` renders in billions
- [x] 3.6 MCP/API: pass `scale` through create/edit item paths where items are defined

## 4. Actuals-replay (#5)

- [x] 4.1 Core: add optional `replacedDefinition?: ItemDefinition` to `LineItem` in `types.ts`
- [x] 4.2 Core: `replayActuals(model, itemId, values)` — set definition to `{ kind: "input", values }`, stash prior definition, `finalize` (validates; may surface `BS_IMBALANCE`)
- [x] 4.3 Core: `restoreItemDefinition(model, itemId)` — swap `replacedDefinition` back; export both; unit tests (replay drives dependents; restore returns the formula; imbalance surfaces)
- [x] 4.4 API: `POST /models/:id/items/:itemId/replay` (seed `values` from the actuals store when not supplied) + a restore route
- [x] 4.5 MCP: `replay_actuals` (and restore) tool wrapping the API

## 5. Treasury template — cyclical mNAV (#4)

- [x] 5.1 Template: back `mnav` with a first-class series (an `mnav_path` driver) instead of the monotonic mean-reversion formula; ship a default path that reproduces prior values
- [x] 5.2 Confirm a non-monotonic observed mNAV series flows through to `asst_price`
- [x] 5.3 Update `treasury.test.ts` expectations for the default path (should match prior behavior)

## 6. Treasury template — drawdown-solvent NAV (#6)

- [x] 6.1 Template: split debt into straight vs. convertible; add a `convert_as_equity` toggle driver treating converts as look-through equity (excluded from senior claims; dilution in share count)
- [x] 6.2 Template: ensure `nav_to_common` stays positive when reserve ≈ straight debt, so `asst_price` no longer collapses to 0 in the trough; document the assumption in the template notes
- [x] 6.3 Test: a deep-drawdown scenario keeps NAV-to-common positive and price non-zero under look-through; the old face-value behavior is still reachable via the toggle

## 7. Docs, integrity & verification

- [x] 7.1 `pnpm --filter @greenthumb/core test` green (incl. new ops + updated treasury expectations); `pnpm typecheck` across workspaces green
- [x] 7.2 API functional tests for the new routes (start date, replay) green on Node 25
- [x] 7.3 Update `docs/Roadmap.md` to note settable start date, unit-scale display, actuals-replay, and the treasury-fidelity improvements
- [x] 7.4 Confirm the integrity contract is intact: validate-on-write, A = L + E, and `{ model, issues, ok }` + `?preview` unchanged
