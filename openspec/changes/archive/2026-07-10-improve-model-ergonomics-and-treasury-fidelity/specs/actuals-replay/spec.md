## ADDED Requirements

### Requirement: Replay actuals into a chosen item

The system SHALL provide an operation that replaces a chosen item's definition
with an actuals-backed input series, so that real observed history drives the
item (and everything downstream of it) instead of the engine formula. The
operation MUST preserve the item's prior definition so it can be restored, and it
MUST validate on write like every other mutation, returning `{ model, issues, ok }`
and honoring `?preview`. The replayed values SHALL be seedable from the item's
stored actuals.

#### Scenario: a formula item is replayed from actuals
- **WHEN** an item defined by a formula is replayed with an observed series
- **THEN** the item's definition becomes an input series holding those values, and computing the model uses them (and propagates them to dependents)

#### Scenario: prior definition is preserved for restore
- **WHEN** a formula item is replayed with actuals
- **THEN** the item's original formula definition is retained so it can be restored later

#### Scenario: replay validates on write
- **WHEN** replayed actuals would break the balance-sheet identity
- **THEN** the operation surfaces the integrity issue (e.g. `BS_IMBALANCE`) rather than accepting it silently

### Requirement: Restore a replayed item to its original definition

The system SHALL provide an operation to restore an item that was replayed back
to its preserved original definition, so the swap to actuals is reversible.

#### Scenario: restore returns the formula
- **WHEN** an item that was replayed from actuals is restored
- **THEN** its definition returns to the original formula that was preserved at replay time

### Requirement: Replay flows through both adapters

The replay and restore operations SHALL be exposed by the API and by an MCP tool,
with the API seeding the replay values from the model's stored actuals for the
item when an explicit series is not supplied.

#### Scenario: adapter seeds replay from stored actuals
- **WHEN** replay is requested for an item via the API without an explicit series
- **THEN** the operation uses the item's stored actuals as the replayed values
