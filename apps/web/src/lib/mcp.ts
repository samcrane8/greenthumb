/**
 * Single source for the greenthumb MCP connection details, rendered on the /mcp
 * page and the Settings "MCP connection info" card. Mirrors the actual server
 * contract in packages/mcp/src/index.ts (a stdio server run via `node`, reading
 * GREENTHUMB_API_URL / GREENTHUMB_API_KEY). Defined once so the docs can't drift.
 */

export const MCP_SERVER_NAME = 'greenthumb'
export const MCP_BUILD_COMMAND = 'pnpm --filter @greenthumb/mcp build'
/** The built entrypoint; users substitute their absolute repo path. */
export const MCP_SERVER_PATH = '<repo>/packages/mcp/dist/index.js'
export const DEFAULT_API_URL = 'http://localhost:3333'

function envEntries(apiUrl: string, apiKey?: string): Record<string, string> {
  const env: Record<string, string> = { GREENTHUMB_API_URL: apiUrl }
  if (apiKey && apiKey.trim()) env.GREENTHUMB_API_KEY = apiKey.trim()
  return env
}

/** Claude Desktop `claude_desktop_config.json` snippet. */
export function claudeDesktopSnippet(apiUrl: string, apiKey?: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        [MCP_SERVER_NAME]: {
          command: 'node',
          args: [MCP_SERVER_PATH],
          env: envEntries(apiUrl, apiKey),
        },
      },
    },
    null,
    2
  )
}

/** Codex `~/.codex/config.toml` snippet. */
export function codexSnippet(apiUrl: string, apiKey?: string): string {
  const env = envEntries(apiUrl, apiKey)
  const envInline = Object.entries(env)
    .map(([k, v]) => `${k} = "${v}"`)
    .join(', ')
  return [
    `[mcp_servers.${MCP_SERVER_NAME}]`,
    `command = "node"`,
    `args = ["${MCP_SERVER_PATH}"]`,
    `env = { ${envInline} }`,
  ].join('\n')
}
