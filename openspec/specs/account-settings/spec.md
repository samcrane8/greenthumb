# account-settings Specification

## Purpose

Provide a local-first account and settings experience: the API advertises its
deployment posture, the app reflects that posture without forcing a login, and
users can manage an optional cloud connection, display preferences, and a local
profile that all persist client-side.

## Requirements

### Requirement: API posture endpoint

The API SHALL expose a read-only, unauthenticated `GET /api/info` endpoint that
reports the deployment posture as `{ mode, requiresApiKey, version }`, where
`mode` is `"local"` when no `API_KEY` is configured and `"cloud"` when one is,
and `requiresApiKey` reflects whether the API key gate is active. The endpoint
SHALL NOT return the API key or any secret, and SHALL be reachable without
presenting a key.

#### Scenario: Local deployment reports open posture

- **WHEN** the API runs with no `API_KEY` configured and a client requests
  `GET /api/info`
- **THEN** the response SHALL be `200` with `mode: "local"` and
  `requiresApiKey: false`

#### Scenario: Cloud deployment reports gated posture

- **WHEN** the API runs with an `API_KEY` configured and a client requests
  `GET /api/info` without a bearer token
- **THEN** the response SHALL be `200` with `mode: "cloud"` and
  `requiresApiKey: true`, and SHALL NOT include the configured key

### Requirement: Account section reflects local-first posture

The sidebar SHALL contain an account section pinned to its bottom-left that
reflects the current connection posture. When connected to a local (open) API,
it SHALL require no login and SHALL indicate that the user is working locally
with full functionality available.

#### Scenario: Local mode requires no login

- **WHEN** the effective API reports `mode: "local"`
- **THEN** the account section SHALL show a "Working locally" state with no login
  prompt, and Settings SHALL be fully accessible

#### Scenario: Account section links to Settings

- **WHEN** the user activates the account section
- **THEN** the app SHALL navigate to the Settings view

### Requirement: Optional cloud connection

The Settings page SHALL allow the user to connect the client to a hosted instance
by entering an instance URL and API key, and to disconnect. While connected, all
API requests SHALL use the configured URL and key; when disconnected, requests
SHALL fall back to the local API. Connection SHALL be validated before it is
saved.

#### Scenario: Connecting to a cloud instance

- **WHEN** the user enters a valid instance URL and API key and confirms the
  connection
- **THEN** the app SHALL validate reachability against that instance (e.g. via
  `GET /api/info`), persist the connection, and route subsequent API requests to
  the configured URL with the key as a bearer token

#### Scenario: Rejecting an invalid connection

- **WHEN** the user submits a URL that is unreachable or a key the instance
  rejects
- **THEN** the app SHALL surface an error and SHALL NOT persist the connection

#### Scenario: Disconnecting returns to local

- **WHEN** the user disconnects from a cloud instance
- **THEN** the stored URL and key SHALL be cleared and subsequent requests SHALL
  target the local API again

### Requirement: Display preferences

The Settings page SHALL let the user configure display preferences — theme
(light, dark, or system), currency, and number format — and these SHALL take
effect immediately and persist across reloads.

#### Scenario: Changing the theme

- **WHEN** the user selects a theme
- **THEN** the app appearance SHALL update immediately and the choice SHALL be
  restored on the next load

#### Scenario: System theme follows the OS

- **WHEN** the theme is set to "system"
- **THEN** the app SHALL follow the operating system's light/dark preference

### Requirement: Local profile

The Settings page SHALL let the user set a local display identity (display name
and email) that persists across reloads. This identity SHALL NOT create a server
account and SHALL NOT be required to use the app.

#### Scenario: Setting a profile

- **WHEN** the user enters a display name and/or email and saves
- **THEN** the values SHALL persist and SHALL be shown in the account section

#### Scenario: Profile is optional

- **WHEN** no profile has been set
- **THEN** the app SHALL remain fully functional and the account section SHALL
  show the default local state

### Requirement: Client-side persistence

The app SHALL persist account and settings state (profile, display preferences,
and cloud connection) client-side so that it survives reloads, works identically
in the browser and the Electron shell, and produces no network egress in local
mode.

#### Scenario: Settings survive a reload

- **WHEN** the user changes any setting and reloads the app
- **THEN** the previously chosen values SHALL be restored

#### Scenario: No egress in local mode

- **WHEN** the user is in local mode and changes settings
- **THEN** persisting those settings SHALL NOT require any network request to a
  remote server
