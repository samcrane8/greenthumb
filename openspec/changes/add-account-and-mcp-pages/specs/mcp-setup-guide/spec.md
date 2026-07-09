## ADDED Requirements

### Requirement: In-app MCP connect guide

The app SHALL provide an MCP connect page that documents how to connect an MCP
client to the running greenthumb instance. The guide SHALL include the build step,
the server command and arguments, and the required environment variables
(`GREENTHUMB_API_URL` and `GREENTHUMB_API_KEY`), consistent with the actual MCP
server contract in `packages/mcp`.

#### Scenario: Guide shows the prerequisites

- **WHEN** the user opens the MCP page
- **THEN** it SHALL show the build step (`pnpm --filter @greenthumb/mcp build`) and
  the path/command needed to run the server (`node <repo>/packages/mcp/dist/index.js`)

#### Scenario: Guide reflects the effective API target

- **WHEN** the user is working locally
- **THEN** the guide SHALL present `GREENTHUMB_API_URL` defaulting to the local API
  (`http://localhost:3333`) and indicate that `GREENTHUMB_API_KEY` is only needed
  when connecting to a gated instance

### Requirement: Claude Desktop instructions

The MCP page SHALL provide copy-paste configuration for Claude Desktop, showing
the `mcpServers` JSON entry with `command`, `args`, and `env`, and a copy control
for the snippet.

#### Scenario: Copying the Claude Desktop config

- **WHEN** the user activates the copy control on the Claude Desktop snippet
- **THEN** the app SHALL copy a valid `mcpServers` JSON entry containing the
  server command, args, and the `GREENTHUMB_API_URL`/`GREENTHUMB_API_KEY` env keys

### Requirement: Codex instructions

The MCP page SHALL provide copy-paste configuration for connecting Codex to the
greenthumb MCP server, with a copy control for the snippet.

#### Scenario: Copying the Codex config

- **WHEN** the user activates the copy control on the Codex snippet
- **THEN** the app SHALL copy a valid Codex MCP server configuration referencing
  the same command, args, and env contract

### Requirement: Troubleshooting guidance

The MCP page SHALL include troubleshooting guidance for the most common failure
modes of connecting an MCP client to greenthumb.

#### Scenario: Troubleshooting is present

- **WHEN** the user views the MCP page
- **THEN** it SHALL include guidance covering at least: the API not running,
  the MCP server not built (`dist` missing), and an API-key mismatch when the
  target instance is gated
