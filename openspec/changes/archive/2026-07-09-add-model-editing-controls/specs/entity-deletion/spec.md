## ADDED Requirements

### Requirement: Delete a driver with reference safety

The system SHALL provide an operation to remove a driver. Removing a driver MUST also
strip that driver's id from every scenario's overrides. If any formula still
references the removed driver by name, the operation MUST report `DANGLING_REF` and
return `ok === false` (not persisting) unless an explicit override is passed.

#### Scenario: removing an unreferenced driver
- **WHEN** a driver referenced by no formula is removed
- **THEN** the driver is gone, any scenario overrides keyed to it are gone, and the model validates

#### Scenario: removing a referenced driver is blocked
- **WHEN** a driver still referenced by a formula is removed without override
- **THEN** the operation returns `ok === false` with a `DANGLING_REF` issue and the driver is not persisted

### Requirement: Delete a scenario but never the last one

The system SHALL provide an operation to remove a scenario. It MUST refuse to remove
the final remaining scenario, so a model always retains at least a base scenario.

#### Scenario: removing an extra scenario
- **WHEN** a model with two scenarios removes the non-base one
- **THEN** the model retains the base scenario and validates

#### Scenario: removing the last scenario is refused
- **WHEN** an operation attempts to remove the only remaining scenario
- **THEN** the operation fails and the model still has that scenario

### Requirement: Delete a whole model

The system SHALL allow deleting an entire model through the API and an MCP tool, so
throwaway models can be cleaned up rather than accumulating.

#### Scenario: deleting a model
- **WHEN** a model is deleted via the MCP delete tool
- **THEN** the model no longer appears in the model list

### Requirement: Delete operations flow through core and both adapters

Driver and scenario deletions SHALL be validate-on-write operations returning
`{ model, issues, ok }`, exposed by the API (honoring `?preview=true` and
`?override=true`) and by MCP tools; model deletion reuses the existing
`DELETE /models/:id` plus a new MCP tool.

#### Scenario: preview a deletion without persisting
- **WHEN** a driver removal is requested with `?preview=true`
- **THEN** the response returns the candidate model and issues but the stored model is unchanged
