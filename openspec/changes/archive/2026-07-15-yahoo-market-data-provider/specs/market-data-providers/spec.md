## MODIFIED Requirements

### Requirement: Pluggable provider registry

The system SHALL provide a registry of market-data providers, each exposing a common
interface, discoverable so a human or Claude can list available providers. The registry
MUST include at least one provider that works with no API key **and returns real market
data**, so the feature is usable with zero configuration. The keyless **default**
provider MUST be such a real-data provider — a synthetic/demo provider MUST NOT be the
default. The provider layer MUST live in the adapters — `packages/core` stays free of
I/O and gains no dependency on it.

#### Scenario: providers are discoverable
- **WHEN** available data providers are listed
- **THEN** the response includes at least one provider, and each entry indicates whether it requires an API key

#### Scenario: a keyless provider works without configuration
- **WHEN** a quote or history is requested through the keyless default provider with no key configured
- **THEN** the request succeeds (or fails only on network/availability, not on a missing key)

#### Scenario: the keyless default returns real data
- **WHEN** a quote is fetched through the default provider with no configuration
- **THEN** the returned price is a real market quote for the symbol (sourced from a live provider), not synthetic/demo data
