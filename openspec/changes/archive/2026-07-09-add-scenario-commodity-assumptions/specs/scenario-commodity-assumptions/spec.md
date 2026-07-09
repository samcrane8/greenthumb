## ADDED Requirements

### Requirement: A scenario may carry commodity price assumptions

A scenario SHALL support an optional commodity price-model binding per
commodity-priced driver, recording the commodity, model, and parameters for that
scenario. Setting a scenario's binding MUST generate the price series over the
timeline and store it as that scenario's per-period override for the driver, so the
engine computes the scenario's own price path with no engine change. The scenario MUST
retain the parameters so they can be re-adjusted later.

#### Scenario: a scenario gets its own price path
- **WHEN** an alternate scenario's commodity binding for `btc_price` is set with a different band or amplitude than the base
- **THEN** that scenario computes with a different `btc_price` series than the base scenario, while the base scenario is unchanged

#### Scenario: parameters persist for re-editing
- **WHEN** a scenario's commodity binding is set and the model is reloaded
- **THEN** the scenario's stored parameters are present and can be adjusted again

### Requirement: Base scenario edits the base binding; alternates edit their own

Setting the commodity price in the **base** scenario SHALL update the driver's base
binding and regenerate its base values (moving the whole model's baseline). Setting it
in an **alternate** scenario SHALL record the binding on that scenario only. A scenario
with no commodity binding for a driver SHALL inherit the base price path.

#### Scenario: alternate scenario edit does not move the base
- **WHEN** an alternate scenario's commodity assumption is changed
- **THEN** the base scenario's computed price path is unchanged

#### Scenario: unset scenario inherits base
- **WHEN** a scenario has no commodity binding for a commodity-priced driver
- **THEN** that scenario computes the driver using the base price path

### Requirement: Scenario commodity paths regenerate on timeline changes

Changing the timeline's period count or granularity SHALL regenerate every scenario's
commodity override from its stored parameters, so each scenario's price path stays
correct over the new horizon — alongside the base bindings.

#### Scenario: resizing regenerates every scenario's price path
- **WHEN** a model with a base binding and an alternate-scenario commodity binding has its period count changed
- **THEN** both the base series and the alternate scenario's override are regenerated for the new horizon and remain finite over every period

### Requirement: Manual scenario override clears the scenario binding

A manual per-period scenario override SHALL clear that scenario's commodity binding for
the driver, so the hand-set values are authoritative and a later timeline edit does not
regenerate over them (mirroring how a manual `setAssumption` unbinds a base-level
commodity driver).

#### Scenario: manual override unbinds the scenario's commodity params
- **WHEN** a scenario driver value is set directly for a driver that had a scenario commodity binding
- **THEN** the scenario's commodity binding for that driver is removed and the manual values are retained

### Requirement: Scenario commodity binding validation

Validation SHALL report `UNKNOWN_PRICE_MODEL` when a scenario's commodity binding names
a commodity or model not in the registry, mirroring the driver-level check.

#### Scenario: unknown model in a scenario binding is rejected
- **WHEN** a scenario is bound to a commodity or model id that is not registered
- **THEN** the operation returns `ok === false` with an `UNKNOWN_PRICE_MODEL` issue

### Requirement: Scenario commodity assumptions flow through core and both adapters

Setting a scenario's commodity price SHALL be a validate-on-write operation returning
`{ model, issues, ok }`, exposed by the API (honoring `?preview=true`, `?override=true`,
and `?summary=true`) and by an MCP tool.

#### Scenario: preview does not persist
- **WHEN** a scenario commodity binding is set with `?preview=true`
- **THEN** the response returns the candidate model and issues but the stored model is unchanged

#### Scenario: MCP can set a scenario's commodity assumptions
- **WHEN** Claude sets a scenario's commodity price via the MCP tool
- **THEN** the change is applied through the same core operation with parity to the API

### Requirement: A scenario-scoped commodity panel in the web app

The web app SHALL provide a Commodity panel on the model workspace, scoped to the
currently selected scenario, that lists the model's commodity-priced drivers and lets
the user adjust each one's price-model parameters for that scenario. Adjusting a
parameter SHALL apply it to the selected scenario and recompute the model. Controls
SHALL seed from the scenario's own binding when present, otherwise from the inherited
base binding.

#### Scenario: adjusting a parameter updates the selected scenario
- **WHEN** the user changes a commodity parameter with an alternate scenario selected
- **THEN** the parameter is applied to that scenario and the model's displayed outputs recompute for it

#### Scenario: the panel follows the scenario switcher
- **WHEN** the user switches the active scenario
- **THEN** the commodity panel shows that scenario's commodity assumptions (its own binding, or the inherited base)
