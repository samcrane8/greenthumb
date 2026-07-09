## ADDED Requirements

### Requirement: A driver may be bound to a commodity price model

A driver SHALL support an optional binding naming a commodity, a price model, and its
parameters. Binding a driver MUST generate the driver's values from that model over the
current timeline and persist the binding, so the series can be regenerated later. Drivers
without a binding are unaffected.

#### Scenario: binding generates the driver's series
- **WHEN** a driver is bound to the Bitcoin power-law model
- **THEN** the driver's values become the generated power-law prices and the binding is stored on the driver

#### Scenario: unbound drivers are unchanged
- **WHEN** a model with no commodity-priced drivers is loaded
- **THEN** every driver behaves exactly as before this capability

### Requirement: Bound drivers regenerate when the timeline changes

Timeline edits SHALL regenerate every driver that carries a price-model binding, because
a price model depends on each period's date, so a bound series stays correct after a
resize or re-grain. Drivers without a binding MUST remain non-destructive across timeline
edits.

#### Scenario: resizing regenerates a bound price series
- **WHEN** a model with a power-law-bound `btc_price` driver has its period count changed
- **THEN** the `btc_price` series is regenerated for the new horizon and remains finite over every period

#### Scenario: unbound series survive a resize
- **WHEN** the timeline is shrunk and then re-grown on a model with an unbound input driver
- **THEN** that driver's stored values are unchanged

### Requirement: Binding validation

Validation SHALL reject a driver whose binding names a commodity or price model not in
the registry (`UNKNOWN_PRICE_MODEL`). Generated values are otherwise ordinary and subject
to all existing validation.

#### Scenario: unknown model is rejected
- **WHEN** a driver is bound to a commodity or model id that does not exist in the registry
- **THEN** the operation returns `ok === false` with an `UNKNOWN_PRICE_MODEL` issue

### Requirement: Commodity pricing flows through core and both adapters

Binding and regenerating a commodity price SHALL be validate-on-write operations in the
core operation layer returning `{ model, issues, ok }`, exposed by the API (honoring
`?preview=true` and `?override=true`) and by MCP tools, alongside a read that lists
available commodities.

#### Scenario: bind through MCP and see the generated series
- **WHEN** Claude binds a driver to the Bitcoin power law via the MCP tool
- **THEN** the driver's generated values are returned through the same core operation, with parity to the API

#### Scenario: preview a binding without persisting
- **WHEN** a commodity binding is applied with `?preview=true`
- **THEN** the response returns the candidate model and issues but the stored model is unchanged
