## Context

greenthumb's operation layer is add-oriented: `addLineItem`, `addDriver`,
`createScenario`, `extendPeriods`, plus value setters. There is no way to trim the
timeline, change granularity, rename anything, edit a driver/scenario's `notes`, or
delete a driver, scenario, or model from the semantic layer (the API has
`DELETE /models/:id`; nothing else). Every op returns the full `{ model, issues, ok }`
and both adapters echo it verbatim. Formula references are by **name**, so any rename
of a driver or item must keep dependent formulas resolvable — but expressions are
stored as strings and the formula module can parse a string to an AST yet cannot
print an AST back to a string. These are the constraints this change works within.

The MSTR build exercised all of this: a 16-quarter template that couldn't be trimmed
to 8, a "Bull +10%/qtr" scenario name left wrong after the path changed, converts
faked as negative `other_holdings`, and ~13 assumption calls each echoing the whole
model.

## Goals / Non-Goals

**Goals:**
- Make a model editable after creation: resize/re-grain the timeline, rename entities
  and fix their notes, and delete drivers/scenarios/models — all through core ops that
  validate-on-write and flow through both adapters.
- Keep renames integrity-safe: a driver/item rename rewrites every referencing formula
  in the same operation, so it never produces a dangling reference.
- Give the treasury template a real debt line so leverage isn't smuggled into
  `other_holdings`.
- Return a concise, structured summary of what each edit changed, and a response mode
  that omits the full model.

**Non-Goals:** (see proposal) live market anchor, multi-tranche preferred, timeline
resampling, transactional batching, general undo.

## Decisions

### D1 — Rename cascades via an AST printer, not string surgery
Add `printExpr(node): string` (AST → canonical string) to `formula.ts`, and
`renameInExpression(expr, renames): string` that parses, rewrites matching `ref`
names, and prints. `renameDriver`/`renameItem` apply the rename to the entity **and**
to every formula item's expression in one clone, then `finalize()`. **Why:** references
are by name; a rename that didn't cascade would break formulas. A printer is the robust,
reusable primitive (also useful for future formula tooling). **Trade-off:** printing
canonicalizes spacing/parenthesization, so an expression may come back reformatted
(semantically identical). Documented; acceptable. **Alternative rejected:** token-position
surgery to preserve original formatting — more code, more edge cases, no real benefit.

### D2 — Deletes lean on existing validation, plus targeted cleanup
`removeDriver` clones, drops the driver, **and strips that driverId from every
scenario's `overrides`** (avoids orphan keys); `finalize()` then reports
`DANGLING_REF` if any formula still names it, so a referenced driver can't be silently
removed (the op returns `ok:false` unless `?override=true`). `removeScenario` filters
by id but **refuses to remove the last scenario** (a model must keep ≥1, the base).
Model delete stays at the adapter (`DELETE /models/:id`), now mirrored by an MCP
`delete_model` tool. **Why:** reuse the integrity engine instead of duplicating
reference-tracking; only add cleanup the validator can't infer. **Alternative
considered:** cascade-delete formulas that reference a removed driver — too destructive
as a default; the override path already lets a caller force it.

### D3 — `setPeriods` is non-destructive; `setGranularity` is a relabel
`setPeriods(n)` sets `timeline.periods = max(1, n)` and clamps `actualsThrough` to
`< n`; it does **not** truncate stored `values` arrays, so shrinking then re-growing
restores the original series (compute already reads only `i < periods` and pads
forward). `setGranularity(g)` sets the label only — the engine is granularity-agnostic
(it never reads granularity in compute), so there is no resampling. **Why:** matches
the engine's actual semantics and makes resizing reversible. **Risk noted below:**
period labels (`periodLabel`) will re-interpret existing values under the new
granularity — a relabel, not a re-bucket.

### D4 — Timeline is also selectable at creation, through every adapter
The API `POST /models` already forwards `body.timeline` into `createModel`, and the
treasury builder already honors `options.timeline` overrides — but MCP `create_model`
never exposed them. Add optional `granularity` and `periods` to the `create_model`
tool so "8 quarterly periods" is expressible up front, not only via post-hoc
`setPeriods`. **Why:** the friction was partly a missing parameter, not a missing
capability.

### D5 — Ops declare their own change summary; no diffing
Add `ChangeSummary = { op: 'add'|'update'|'remove'|'rename'; entity: 'item'|'driver'
|'scenario'|'timeline'|'model'; id?; name?; fields?: string[]; detail?: string }` and
an optional `change?: ChangeSummary` on `OpResult`. Each op sets it explicitly (it
knows what it did — e.g. `setAssumption` → `{op:'update', entity:'driver', id, name,
fields:['values']}`). Adapters accept `?summary=true`, returning `{ change, issues, ok,
previewed? }` **without** the `model`. **Why:** a declared summary is exact and O(1);
a computed field-level diff of the whole graph is costly and unnecessary. Default
response is unchanged (full model), so nothing breaks. **Alternative rejected:**
structural diff of before/after models — more code, slower, and less precise about
intent than the op declaring it.

### D6 — Treasury debt is a driver-fed subtraction from NAV-to-common
Add a `debt_notional` driver (straight + convertible collapsed, since multi-tranche is
a non-goal) and fold it into `nav_to_common = reserve + cash + other_holdings - debt -
preferred_notional`. Restore `other_holdings` to its true meaning (STRC only). **Why:**
gives leverage a semantically honest home; the convertible/straight split can refine
later without another NAV rewrite. Optionally add a small debt-service line if a coupon
driver is set; kept minimal here. This **modifies** the `bitcoin-treasury-template`
capability (new drivers/items in its scaffold).

## Risks / Trade-offs

- **Rename reformats formulas** (D1) → document that expressions are canonicalized on
  rename; add round-trip tests (`parse → print → parse` is stable) so meaning is
  provably preserved.
- **A rename collides with an existing name** → `renameX` validates; a collision
  surfaces as `DUPLICATE_NAME` and the op returns `ok:false` (no partial rename, since
  ops are clone-then-finalize).
- **`setPeriods` shrink hides data** → non-destructive by design; but a reader may be
  surprised that grown-back periods "remember" old values. Documented; acceptable and
  usually desirable.
- **`setGranularity` relabels without resampling** → could mislead if a user expects
  monthly values to aggregate into quarters. Mitigate with a clear tool description and
  a note in the change summary detail.
- **Treasury template shape change** (D6) is BREAKING for anyone who built on the exact
  current item/driver set → additive within the template; existing saved models are
  untouched (they keep their stored graph), only newly created treasury models get the
  debt line.

## Migration Plan

Additive and backward compatible. New ops/routes/tools only; existing endpoints and
the default (full-model) response are unchanged. `OpResult.change` is optional, so
current consumers ignore it. No stored-model migration: existing models load as-is;
the treasury debt line appears only in newly created treasury models. Rollback =
revert code; persisted JSON stays readable.

## Open Questions

- Should `removeDriver` referenced by a formula **cascade** (rewrite/remove dependent
  formulas) under `?override=true`, or always require the caller to fix formulas first?
  (Leaning: require-first by default; override just bypasses the `ok` gate as elsewhere.)
- Should the treasury debt line also emit a `debt_service` cash outflow (needs a coupon
  driver), or stay a pure NAV subtraction for now? (Leaning: NAV subtraction only, to
  keep the template first-order; coupon can come with multi-tranche later.)
- Is `?summary=true` enough, or should edit endpoints default to lean responses with an
  opt-in `?full=true`? (Leaning: keep full as default for compatibility; opt into lean.)
