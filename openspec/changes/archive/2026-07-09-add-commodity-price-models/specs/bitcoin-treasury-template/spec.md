## MODIFIED Requirements

### Requirement: Template exposes tunable assumptions as drivers

The template SHALL express its key assumptions as drivers — including at least a crypto
price series, preferred issuance pace, preferred dividend rate, common ATM issuance, an
amplification cap on preferred relative to reserve, and an mNAV target — so a human or
Claude can tune the model via `set_assumption`/scenarios rather than editing formulas.
The crypto price driver (`btc_price`) SHALL be a **commodity-priced driver bound to the
Bitcoin power-law model** (trend plus halving-cycle oscillation), spot-anchored to the
template's starting spot, rather than a constant-rate compounding path; formulas reference
it by name so the reserve build is unchanged.

#### Scenario: adjusting an assumption changes outputs
- **WHEN** the preferred dividend-rate driver is increased via `set_assumption`
- **THEN** the recomputed dividend obligation increases and dividend coverage decreases, with the write validating successfully

#### Scenario: issuance ramp uses an S-curve
- **WHEN** the preferred issuance series is defined via the `scurve`/`logistic` primitives over the ramp assumption
- **THEN** issuance starts near the configured start pace and ramps toward the peak pace over the ramp horizon

#### Scenario: BTC price follows the power law with oscillation
- **WHEN** a fresh `bitcoin_treasury` model is created and computed
- **THEN** the `btc_price` driver's series is the spot-anchored Bitcoin power law (period 0 at the starting spot, then arcing up through fair value and back per the halving-cycle oscillation), not a constant-growth line
