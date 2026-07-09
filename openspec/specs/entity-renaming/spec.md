# entity-renaming Specification

## Purpose

Let users rename drivers, items, and scenarios and edit entity notes after
creation, with formula references cascading automatically so a rename never
introduces a dangling reference — as validate-on-write operations in the core
operation layer that flow through both the API and the MCP adapters.

## Requirements

### Requirement: Rename drivers and items with reference cascade

The system SHALL provide operations to rename a driver or a line item. Because
formulas reference entities by name, a rename MUST rewrite every formula expression
that references the old name so that no dangling reference is introduced. The rename
and the cascade MUST occur in a single validate-on-write operation.

#### Scenario: renaming a driver updates dependent formulas
- **WHEN** a driver named `btc_growth` referenced by the formula `prior(btc_price) * (1 + btc_growth)` is renamed to `q_growth`
- **THEN** the driver is `q_growth`, the dependent formula reads `... (1 + q_growth)`, the model validates, and no `DANGLING_REF` is reported

#### Scenario: renaming to an existing name is rejected
- **WHEN** a driver is renamed to a name already used by another item or driver
- **THEN** the operation returns `ok === false` with a `DUPLICATE_NAME` issue and no partial rename is persisted

### Requirement: Rename scenarios

The system SHALL provide an operation to rename a scenario. Scenario names are not
referenced by formulas, so no cascade is required.

#### Scenario: renaming a scenario
- **WHEN** a scenario named "Bull (BTC +10%/qtr)" is renamed to "Bull (power-law)"
- **THEN** the scenario's overrides are unchanged and its name is updated, and the model validates

### Requirement: Edit entity notes

The system SHALL provide an operation to set the `notes`/annotation text of a driver
or item, so stale descriptions can be corrected without recreating the entity.

#### Scenario: updating a stale note
- **WHEN** a driver's note is set to a corrected description
- **THEN** the driver's `notes` reflects the new text and the model validates

### Requirement: Rename and note operations flow through core and both adapters

These SHALL be validate-on-write operations returning `{ model, issues, ok }`, exposed
by the API (honoring `?preview=true` and `?override=true`) and by MCP tools. Formula
canonicalization from a rename MUST preserve expression meaning.

#### Scenario: renamed formula is semantically equivalent
- **WHEN** a driver rename canonicalizes a dependent expression's formatting
- **THEN** the computed series for that item are identical to before the rename
