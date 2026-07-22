## ADDED Requirements

### Requirement: Set the timeline start date

The system SHALL provide a way to set a model's timeline **start date** — both at
creation and as an edit operation — so period labels reflect the real calendar
window a model covers (e.g. a history beginning Q3 2020), not a fixed default.
Setting the start date MUST regenerate any commodity-bound drivers, because
commodity price generation reads calendar dates, and MUST validate on write like
other timeline edits, returning `{ model, issues, ok }` and honoring `?preview`.

#### Scenario: choose the start date at creation
- **WHEN** a model is created with a start date of `2020-07-01`
- **THEN** the model's timeline starts at `2020-07-01` and its period labels reflect that window

#### Scenario: change the start date after creation
- **WHEN** an existing model's start date is set to `2020-07-01`
- **THEN** the timeline start becomes `2020-07-01`, commodity-bound drivers are regenerated over the new dates, and the model validates

#### Scenario: start date is settable through both adapters
- **WHEN** the start date is set via the `create_model` / `set_timeline` MCP tools and via the API
- **THEN** both apply the new start date and return the updated model (or a preview when requested)
