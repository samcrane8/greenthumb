## ADDED Requirements

### Requirement: A model may store a ranked capital stack

A model SHALL support an optional capital stack: a set of asset references and an
ordered set of tranches. Each tranche MUST have a stable id, a name, a kind
(`senior_debt`, `subordinated_debt`, `convertible`, `preferred`, or `common`), a
numeric seniority rank, and — for claim tranches — a reference to a model series (item
or driver name) giving its claim/notional per period. The stack stores only definitions
and references, never computed numbers.

#### Scenario: a capital stack persists with the model
- **WHEN** a model with a capital stack is saved and reloaded
- **THEN** the stack's asset references and tranches (kind, seniority, refs) are present and intact, with no computed data stored on it

#### Scenario: the stack is optional and backward compatible
- **WHEN** a model without a capital stack is loaded
- **THEN** it loads and validates successfully and is treated as having no stack

### Requirement: Tranche references are validated

Validation SHALL reject a capital stack whose asset reference, notional reference, rate
reference, or shares reference names a series that is not a known item or driver
(`DANGLING_STACK_REF`), and SHALL require tranche ids to be unique
(`DUPLICATE_TRANCHE_ID`) and at most one residual (common) tranche
(`BAD_CAPITAL_STACK`). These checks MUST run only when a stack is present.

#### Scenario: a dangling reference is rejected
- **WHEN** a tranche's notional reference names a series that does not exist
- **THEN** the operation returns `ok === false` with a `DANGLING_STACK_REF` issue

#### Scenario: more than one common tranche is rejected
- **WHEN** a capital stack defines two `common` tranches
- **THEN** validation reports a `BAD_CAPITAL_STACK` error

### Requirement: Seniority waterfall analysis

Analysis SHALL derive, for a scenario and per period, a seniority waterfall: total asset
value from the asset references, and for each tranche in ascending seniority its claim,
amount paid, recovery fraction, and cumulative claims ahead of it. Claims MUST be paid in
priority order against the available value; the residual (common) tranche receives what
remains after all senior and preferred claims.

#### Scenario: senior claims are paid before junior
- **WHEN** asset value is less than the sum of all claims in a period
- **THEN** the most senior tranche recovers fully (up to its claim) before any junior tranche recovers, and a junior tranche's recovery is zero once value is exhausted

#### Scenario: residual to common is what remains
- **WHEN** the waterfall is computed for a period
- **THEN** residual-to-common equals asset value minus the total senior and preferred claims (floored at zero), and NAV per share equals that residual divided by common shares

### Requirement: Coverage, blended cost, leverage, and dilution outputs

Analysis SHALL also return per period: a coverage ratio for each tranche, the blended
cost of capital across the interest/dividend-bearing tranches, the implied leverage of
the common residual, and the diluted share count including in-the-money convertibles
treated as equity.

#### Scenario: coverage reflects asset value against claims
- **WHEN** asset value rises while claims are held fixed
- **THEN** each tranche's coverage ratio increases

#### Scenario: a convertible treated as equity dilutes rather than claims
- **WHEN** a convertible tranche is treated as equity
- **THEN** it is excluded from the senior claim set and instead increases the diluted share count, lowering NAV per share versus treating it as face-value debt

### Requirement: Capital-stack operations flow through core and both adapters

Adding, updating, and removing a tranche and setting the stack's asset references SHALL
be validate-on-write operations in the core operation layer returning
`{ model, issues, ok }`, exposed by the API (honoring `?preview=true` and
`?override=true`) and by MCP tools; the derived analysis SHALL be exposed as a read on
both. No stack logic is duplicated in an adapter.

#### Scenario: preview does not persist
- **WHEN** a tranche is added with `?preview=true`
- **THEN** the response returns the candidate model and issues but the stored model is unchanged

#### Scenario: analysis is available to MCP and the API
- **WHEN** the capital-stack analysis is requested for a scenario
- **THEN** the same core analysis is returned through the API and the MCP tool, with per-tranche and residual results

### Requirement: References stay integrity-safe under edits

Renaming a referenced item or driver SHALL update the capital stack's references in the
same operation, and removing a referenced series MUST surface as a dangling stack
reference, so a stored stack never points at a nonexistent series.

#### Scenario: renaming a referenced series updates the stack
- **WHEN** an item referenced by a tranche's notional is renamed
- **THEN** the tranche's reference is updated to the new name and the model still validates

### Requirement: The treasury template ships a default capital stack

The `bitcoin_treasury` template SHALL emit a default capital stack referencing its
existing series — asset references for the reserve and cash holdings, and tranches for
senior debt, preferred, and common — so a fresh model has an inspectable structure. Its
analysis's residual-to-common MUST tie out to the template's existing NAV-to-common
series.

#### Scenario: a fresh treasury model has a stack that ties out
- **WHEN** a `bitcoin_treasury` model is created and its capital-stack analysis is computed for the base scenario
- **THEN** the stack contains senior-debt, preferred, and common tranches, and its residual-to-common equals the model's `nav_to_common` series within tolerance
