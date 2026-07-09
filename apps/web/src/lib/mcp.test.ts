import { describe, it, expect } from 'vitest'
import { claudeDesktopSnippet, codexSnippet, MCP_SERVER_PATH } from './mcp'

describe('claudeDesktopSnippet', () => {
  it('produces valid JSON with the server command, args, and env', () => {
    const parsed = JSON.parse(claudeDesktopSnippet('http://localhost:3333'))
    const entry = parsed.mcpServers.greenthumb
    expect(entry.command).toBe('node')
    expect(entry.args).toEqual([MCP_SERVER_PATH])
    expect(entry.env.GREENTHUMB_API_URL).toBe('http://localhost:3333')
    // No key requested → key env omitted.
    expect(entry.env.GREENTHUMB_API_KEY).toBeUndefined()
  })

  it('includes the API key env only when a key is provided', () => {
    const parsed = JSON.parse(claudeDesktopSnippet('https://acme.app', 'k'))
    expect(parsed.mcpServers.greenthumb.env.GREENTHUMB_API_KEY).toBe('k')
  })
})

describe('codexSnippet', () => {
  it('emits a valid TOML server table with command, args, and env', () => {
    const toml = codexSnippet('http://localhost:3333')
    expect(toml).toContain('[mcp_servers.greenthumb]')
    expect(toml).toContain('command = "node"')
    expect(toml).toContain(`args = ["${MCP_SERVER_PATH}"]`)
    expect(toml).toContain('GREENTHUMB_API_URL = "http://localhost:3333"')
    expect(toml).not.toContain('GREENTHUMB_API_KEY')
  })

  it('includes the API key in the env table when provided', () => {
    expect(codexSnippet('https://acme.app', 'k')).toContain('GREENTHUMB_API_KEY = "k"')
  })
})
