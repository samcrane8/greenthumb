## Why

Building the MSTR bitcoin-treasury model surfaced a consistent theme: greenthumb
lets you *add* to a model but rarely *change* or *remove* what's there, and every
edit echoes the whole model back. Concretely, while modeling MSTR we could not
trim or re-grain the timeline (the template is stuck at 16 quarterly periods when
8 were asked for), could not rename a now-wrong scenario ("Bull +10%/qtr" after it
became a power-law path) or fix stale driver notes, could not delete a throwaway
model or an unwanted built-in scenario, and had to smuggle MSTR's ~$6.7B of
convertible notes in as a *negative* `other_holdings` value because there is no
debt primitive — leaving a driver whose name and note actively mislead. On top of
that, ~13 assumption calls each returned the entire model JSON with no "here's what
changed" summary to diff against.

None of this blocked the model, but the rough edges make models hard to maintain
and share. This change adds the missing mutation and control surface — timeline
editing, rename/annotate, delete, a real debt line in the treasury template, and
lean edit responses — landing in `packages/core` first, then the API and MCP
adapters, preserving the `{ model, issues, ok }` + `?preview=true` contract.

## What Changes

- **Timeline editing** — new core ops to set the period count **down as well as up**
  (trim, not just `extend_periods`) and to set granularity; expose granularity +
  periods on the MCP `create_model` tool (the API store already accepts a
  `timeline` on create, but MCP never passed it).
- **Rename & annotate** — rename drivers, scenarios, and line items, and edit their
  `notes`. Renaming a driver/item **cascades through every formula expression** that
  references it by name, so a rename never silently creates a dangling reference.
- **Delete** — remove drivers and scenarios (with ref-safety checks), and delete a
  whole model, via core ops exposed through both adapters (the API already has
  `DELETE /models/:id`; MCP gains a tool, plus `remove_driver` / `remove_scenario`).
- **Debt instruments in the treasury template** — the `bitcoin_treasury` template
  gains a native straight/convertible **debt** line that subtracts from
  NAV-to-common, so leverage isn't faked by poisoning `other_holdings`. **BREAKING**
  for the treasury template's shape (new drivers/items), but additive to the engine.
- **Lean edit responses** — edit ops carry a concise `change` summary (what entity
  was added/updated/removed/renamed and which fields moved); adapters can return the
  summary + issues without forcing consumers to diff the whole model, via a
  `?summary=true` response mode that omits the full graph.

## Capabilities

### New Capabilities
- `timeline-editing`: Set a model's period count (grow or shrink) and granularity
  after creation, and choose them at creation time through every adapter.
- `entity-renaming`: Rename drivers, scenarios, and items and edit their notes, with
  formula references updated in lockstep so renames stay integrity-safe.
- `entity-deletion`: Delete drivers, scenarios, and whole models through the core
  operation layer and both adapters, guarding against dangling references.
- `edit-response-summaries`: A concise, structured summary of what an edit changed,
  plus a response mode that returns it (with issues) instead of the full model.

### Modified Capabilities
- `bitcoin-treasury-template`: Add a native debt line (straight + convertible)
  feeding NAV-to-common, replacing the "negative other-holdings" workaround.

## Impact

- **Core (first):** `operations.ts` (new `setPeriods`/`setGranularity`,
  `renameDriver`/`renameScenario`/`renameItem`, `updateNotes`, `removeDriver`/
  `removeScenario`; edit ops return a `change` summary), `templates.ts` (treasury
  debt drivers/items), `validation.ts` (rename cascade must not orphan refs; delete
  guards), `formula.ts` (a rename helper to rewrite `ref` names in an AST/expression),
  `types.ts` (a `ChangeSummary` type), `index.ts` exports.
- **API:** new routes — `PUT /models/:id/timeline`, rename/notes routes,
  `DELETE /models/:id/drivers/:driverId`, `DELETE /models/:id/scenarios/:scenarioId`;
  all reuse `EditsController.#apply`; add `?summary=true` handling there.
- **MCP:** new tools (`set_timeline`, `rename_driver`/`rename_scenario`/`rename_item`,
  `set_notes`, `remove_driver`, `remove_scenario`, `delete_model`); add
  `granularity` + `periods` to `create_model`; edit tools surface the change summary
  in their human text.
- **Web:** minor — rename/delete affordances can follow later; not required here.
- **Integrity:** rename cascades keep formulas resolvable (no new `DANGLING_REF`);
  delete ops refuse to remove a driver/scenario still referenced (or cascade with an
  explicit flag). Costs-negative and `A = L + E` rules are unchanged; the treasury
  debt line is a liability-signed subtraction from NAV, not a balance-sheet item, so
  it does not trigger BS enforcement.

## Non-goals

- **Not rebuilding Excel** (PRD §3): these are semantic model edits, not free-form
  cell operations.
- **No live market-data anchor for mNAV/price.** Anchoring `asst_price` to a real
  MSTR quote needs an external feed and stays out of scope; mNAV remains a modeled,
  overridable assumption.
- **No multi-tranche preferred modeling.** Breaking the preferred stack into
  STRK/STRF/STRD/STRC with per-series rates is deferred; the template keeps a single
  blended rate.
- **No timeline resampling.** Changing granularity relabels the axis (the engine is
  granularity-agnostic); it does not re-bucket monthly values into quarters.
- **No transactional batching guarantees across independent tool calls.** Making a
  batch of writes all-or-nothing is a client/protocol concern, not addressed here.
- **No general undo/history.** Snapshots already exist; a full undo stack is separate.
