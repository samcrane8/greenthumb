## MODIFIED Requirements

### Requirement: A lean response mode omits the full model

The API and MCP SHALL support a response mode that returns the change summary and
issues WITHOUT the full model graph, so a consumer making many edits is not forced
to receive and diff a near-identical full model on every call. The **API**
full-model response MUST remain the default for backward compatibility (the web
app depends on it). The **MCP mutating tools**, by contrast, SHALL default to the
lean summary response — because iterative editing through Claude is token-heavy
when every edit echoes the whole graph — and MUST offer an explicit opt-in to
return the full model when the caller needs it.

#### Scenario: summary-only response
- **WHEN** an edit is made with the lean/summary response mode
- **THEN** the response includes the change summary and issues but not the full model

#### Scenario: API default response is unchanged
- **WHEN** an edit is made via the API without requesting the lean mode
- **THEN** the response still includes the full model, exactly as before this change

#### Scenario: MCP defaults to lean with a full opt-in
- **WHEN** a mutating MCP tool is called without requesting the full model
- **THEN** it returns the change summary and issues without the full graph; and **WHEN** the same tool is called opting into the full model
- **THEN** it returns the full model graph
