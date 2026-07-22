# unit-display Specification

## Purpose

Let currency figures stored in a non-unit magnitude (e.g. $ millions) render at
their true size via a display **scale**, and annotate rendered values in the web
statement grid and stat tiles with a unit/scale hint — so readers can tell a
$-millions figure from a whole-dollar figure, a coin count from a share count,
and a ratio from a percentage. Scale is presentation-only and never enters any
calculation.

## Requirements

### Requirement: Currency values carry a display scale

The domain model SHALL support a display **scale** (magnitude) for currency
figures so that values stored in a non-unit magnitude (e.g. $ millions) render at
their true size. An item or driver MAY declare a `scale` (a magnitude multiplier
such as 1, 1000, or 1,000,000); when absent it defaults to a model-level default
scale, and when that is absent it defaults to 1. The scale MUST be display
metadata only — it MUST NOT change any stored value or enter any calculation, so
the A = L + E identity and all formula results are unaffected.

#### Scenario: millions-scaled value renders at true magnitude
- **WHEN** an item with value `50956` declares a scale of 1,000,000 and is rendered
- **THEN** it displays as roughly `$51.0B` (value × scale, compacted), not `$51.0K`

#### Scenario: scale never affects computation
- **WHEN** a currency item is given or changes its scale
- **THEN** the computed series and the balance-sheet identity are identical to before, because scale is presentation-only

#### Scenario: default when no scale is declared
- **WHEN** a currency item declares no scale and the model declares no default scale
- **THEN** it renders as though the scale were 1 (raw units), exactly as before this capability

### Requirement: Rendered values are annotated with unit and scale

The web statement grid and stat tiles SHALL annotate rendered figures with a
unit/scale hint, so a reader can tell a $-millions figure from a whole-dollar
figure, a coin count from a share count, and a ratio from a percentage. Percent
values, which are stored as decimal fractions, MUST render as percentages
(0.105 → 10.5%).

#### Scenario: currency scale is visible to the reader
- **WHEN** a $-millions item and a whole-dollar item appear in the same statement
- **THEN** each figure carries a unit/scale hint so the two magnitudes are not confused

#### Scenario: percent decimal renders as a percentage
- **WHEN** a driver stored as `0.105` has the percent unit
- **THEN** it renders as `10.5%`
