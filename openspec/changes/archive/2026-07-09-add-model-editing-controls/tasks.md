## 1. Formula printer + rename helper (core)

- [x] 1.1 Add `printExpr(node): string` (AST → canonical string) to `packages/core/src/formula.ts`, covering nums, refs, unary, binary (with correct precedence/parenthesization), and calls
- [x] 1.2 Add `renameInExpression(expr, renames: Record<string,string>): string` that parses, rewrites matching `ref` names, and prints
- [x] 1.3 Tests: `parse → print → parse` round-trip is stable for the saas + treasury formulas; rename rewrites only matching refs (not function names or substrings)

## 2. Change summary type + op wiring (core)

- [x] 2.1 Add `ChangeSummary` type in `types.ts` and optional `change?: ChangeSummary` on `OpResult`
- [x] 2.2 Have each existing op in `operations.ts` populate `change` (add/update/remove for items, drivers, scenarios, timeline, charts, widgets)
- [x] 2.3 Export `ChangeSummary` from `index.ts`

## 3. Timeline editing (core)

- [x] 3.1 Add `setPeriods(model, n)` — set `timeline.periods = max(1, n)`, clamp `actualsThrough` to `< n`, non-destructive to stored values; returns `OpResult` with `change`
- [x] 3.2 Add `setGranularity(model, granularity)` — relabel only; returns `OpResult`
- [x] 3.3 Tests: shrink 16→8 computes over 8; re-grow 8→16 restores prior values; actuals index clamped; granularity change leaves values intact

## 4. Rename + notes (core)

- [x] 4.1 Add `renameDriver(model, driverId, newName)` and `renameItem(model, itemId, newName)` — rename the entity and cascade `renameInExpression` across all formula items; `finalize()` catches `DUPLICATE_NAME`
- [x] 4.2 Add `renameScenario(model, scenarioId, newName)` (no cascade)
- [x] 4.3 Add `updateNotes(model, entityId, notes)` for drivers/items
- [x] 4.4 Tests: driver rename updates dependent formulas + computes identically; rename-to-existing-name → `ok:false` DUPLICATE_NAME; scenario rename preserves overrides

## 5. Deletion (core)

- [x] 5.1 Add `removeDriver(model, driverId)` — drop driver, strip its id from every scenario's overrides; referenced driver → `DANGLING_REF`/`ok:false`
- [x] 5.2 Add `removeScenario(model, scenarioId)` — refuse to remove the last remaining scenario
- [x] 5.3 Tests: remove unreferenced driver (overrides cleaned) validates; remove referenced driver blocked; remove last scenario refused; remove extra scenario ok

## 6. Treasury debt line (core)

- [x] 6.1 Add a `debt_notional` driver (straight + convertible) to `bitcoinTreasuryModel` and fold into `nav_to_common = reserve + cash + other_holdings - debt_notional - preferred_notional`
- [x] 6.2 Restore `other_holdings` note/meaning to genuine holdings only (STRC)
- [x] 6.3 Tests: template still validates + converges; increasing `debt_notional` lowers `nav_to_common`/`nav_per_share` by the added debt and leaves `other_holdings` untouched
- [x] 6.4 `pnpm --filter @greenthumb/core build` + `test` green

## 7. API adapter

- [x] 7.1 Add routes: `PUT /models/:id/timeline`, `PUT /models/:id/drivers/:driverId/name`, `PUT /models/:id/scenarios/:scenarioId/name`, `PUT /models/:id/items/:itemId/name`, `PUT /models/:id/(drivers|items)/:id/notes`, `DELETE /models/:id/drivers/:driverId`, `DELETE /models/:id/scenarios/:scenarioId`
- [x] 7.2 Add handlers in `EditsController` reusing `#apply`; add `?summary=true` in `#apply` to return `{ change, issues, ok }` without `model`
- [x] 7.3 API tests: setPeriods trims; rename cascades; remove-referenced → 422; `?summary=true` omits model; delete driver/scenario paths

## 8. MCP adapter

- [x] 8.1 Add tools: `set_timeline`, `rename_driver`, `rename_item`, `rename_scenario`, `set_notes`, `remove_driver`, `remove_scenario`, `delete_model`
- [x] 8.2 Add `granularity` + `periods` params to `create_model`
- [x] 8.3 Edit tools include the change summary in their human text
- [x] 8.4 Rebuild `packages/mcp`; live smoke test (create 8-quarter treasury, rename a scenario, remove a driver, delete a model) against a running API with an isolated store

## 9. Verification & docs

- [x] 9.1 `pnpm typecheck` and all workspace tests green
- [x] 9.2 Update `docs/Roadmap.md` to note the new editing controls and the treasury debt line
