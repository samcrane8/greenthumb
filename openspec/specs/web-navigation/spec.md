# web-navigation Specification

## Purpose

Introduce client-side routing to the web/desktop app so the workspace, settings,
and MCP views are each addressable at distinct URL paths, with nested settings
sections and sidebar navigation that supports browser history.

## Requirements

### Requirement: Addressable application views

The web/desktop app SHALL provide client-side routing so that the model
workspace, the account/settings view, and the MCP connect view are each
reachable at a distinct URL path within a single-page application, without a
full server reload when navigating between them.

#### Scenario: Workspace remains the default route

- **WHEN** the app loads at `/`
- **THEN** the model workspace (sidebar model list, templates, and statement
  view) SHALL render exactly as before this change, with no behavioral change to
  model selection, creation, editing, or validation

#### Scenario: Settings route

- **WHEN** the user navigates to `/settings`
- **THEN** the account/settings view SHALL render in the main pane while the
  sidebar layout (including the account section) remains visible, defaulting to
  the first settings section

#### Scenario: MCP route

- **WHEN** the user navigates to `/settings/mcp`
- **THEN** the MCP connect page SHALL render as a section of the settings view
  while the sidebar layout remains visible

#### Scenario: Legacy MCP path redirects

- **WHEN** the app is opened at the legacy `/mcp` path
- **THEN** it SHALL redirect to `/settings/mcp`

#### Scenario: Deep link to a sub-route

- **WHEN** the app is opened directly at `/settings` or any settings section
  (e.g. `/settings/cloud`) as a deep link or reload
- **THEN** the corresponding view SHALL render without redirecting to `/`

### Requirement: Nested settings sections

The account/settings view SHALL be a nested layout whose left menu selects among
sections — preferences, profile, cloud connection, and MCP — and each section
SHALL be its own addressable route under `/settings/<section>`.

#### Scenario: Selecting a settings section

- **WHEN** the user activates a section in the settings left menu
- **THEN** the URL SHALL update to `/settings/<section>`, only that section's
  content SHALL render in the settings content pane, and its menu item SHALL be
  marked active

#### Scenario: Bare settings path selects a default section

- **WHEN** the user navigates to `/settings` with no section
- **THEN** the app SHALL show a default section (preferences) without a dead
  empty pane

### Requirement: Sidebar navigation and history

The sidebar SHALL provide navigation controls that route to the workspace,
Settings, and MCP views, and browser back/forward SHALL move between visited
views.

#### Scenario: Navigating via the sidebar

- **WHEN** the user activates a sidebar navigation control for Settings or MCP
- **THEN** the URL SHALL update to the corresponding path and the target page
  SHALL render without a full page reload

#### Scenario: Back button returns to the previous view

- **WHEN** the user navigates from `/` to `/settings` and then presses the
  browser back button
- **THEN** the app SHALL return to `/` and restore the workspace view

#### Scenario: Active view is indicated

- **WHEN** a route is active
- **THEN** its corresponding sidebar navigation control SHALL be visually marked
  as active
