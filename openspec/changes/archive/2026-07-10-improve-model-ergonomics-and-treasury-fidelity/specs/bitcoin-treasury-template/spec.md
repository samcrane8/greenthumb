## ADDED Requirements

### Requirement: mNAV can follow a non-monotonic premium path

The bitcoin treasury template SHALL model the market premium (mNAV) as a
series-backed path rather than a strictly monotonic mean-reversion, so that a
cyclical / U-shaped premium history (e.g. 3.4× → 0.74× → 2.1× → ~0.95×) can be
represented and backtested. The mNAV SHALL be driven by a first-class series (a
driver or per-scenario series) that a user or agent can set to observed or assumed
values. The template MUST ship a default path so that, absent any override, the
model reproduces its prior behavior.

#### Scenario: an observed cyclical premium can be applied
- **WHEN** the mNAV series is set to a non-monotonic observed path
- **THEN** the model's mNAV follows that path period-by-period (rising and falling), and the modeled price reflects it

#### Scenario: default reproduces prior behavior
- **WHEN** a treasury model is created and the mNAV series is left at its default
- **THEN** the mNAV path matches the template's prior mean-reversion behavior

### Requirement: NAV-to-common stays economically sensible in deep drawdowns

The bitcoin treasury template SHALL provide a modeling path so that NAV-to-common
does not collapse the modeled equity value to zero merely because reserve value
approaches outstanding debt in a drawdown. Convertible instruments SHALL be
representable as **look-through equity** (excluded from senior claims, their
dilution carried in the share count) via an explicit, scenario-able assumption, so
that in a deep drawdown the common retains the option-like value it has in
reality rather than pricing to zero.

#### Scenario: converts treated as look-through equity keep NAV positive
- **WHEN** BTC reserve value falls to approximately the level of outstanding debt in a drawdown, with convertibles treated as look-through equity
- **THEN** NAV-to-common remains positive and the modeled share price does not collapse to zero

#### Scenario: the treatment is an explicit assumption
- **WHEN** a reader inspects the treasury model
- **THEN** whether convertibles are treated as look-through equity or face-value debt is an explicit, adjustable assumption, not a hidden default
