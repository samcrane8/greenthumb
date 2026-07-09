# edit-response-summaries Specification

## Purpose

Give every semantic edit operation a concise, operation-declared change summary
alongside the existing `{ model, issues, ok }` result, offer a lean response mode
that omits the full model graph, and surface the change in MCP edit tools'
human-readable text — so consumers making many edits are not forced to receive and
diff a near-identical full model on every call.

## Requirements

### Requirement: Edit operations carry a structured change summary

Every semantic edit operation SHALL include a concise structured summary of what it
changed — the kind of change (add/update/remove/rename), the entity type, its
id/name, and the fields affected — alongside the existing `{ model, issues, ok }`. The
summary MUST be declared by the operation (describing its intent), not derived from a
full-model diff.

#### Scenario: an assumption edit reports what changed
- **WHEN** a driver's base values are set
- **THEN** the result includes a change summary identifying an `update` to that `driver` and the `values` field

#### Scenario: a rename reports the old and new names
- **WHEN** a scenario is renamed
- **THEN** the change summary identifies a `rename` of that `scenario`

### Requirement: A lean response mode omits the full model

The API and MCP SHALL support a response mode that returns the change summary and
issues WITHOUT the full model graph, so a consumer making many edits is not forced to
receive and diff a near-identical full model on every call. The full-model response
MUST remain the default for backward compatibility.

#### Scenario: summary-only response
- **WHEN** an edit is made with the lean/summary response mode
- **THEN** the response includes the change summary and issues but not the full model

#### Scenario: default response is unchanged
- **WHEN** an edit is made without requesting the lean mode
- **THEN** the response still includes the full model, exactly as before this change

### Requirement: MCP edit tools surface the change in their text

MCP edit tools SHALL include the change summary in their human-readable text result,
so Claude sees what an edit altered without parsing the full model JSON.

#### Scenario: MCP tool text names the change
- **WHEN** an MCP edit tool succeeds
- **THEN** its text summary states the entity and kind of change that was applied
