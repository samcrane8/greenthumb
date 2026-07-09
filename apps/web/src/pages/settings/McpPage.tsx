import { useState } from 'react'
import { AlertTriangle, Terminal } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CodeBlock } from '@/components/CopyBlock'
import { useSettings } from '@/settings/store'
import {
  claudeDesktopSnippet,
  codexSnippet,
  DEFAULT_API_URL,
  MCP_BUILD_COMMAND,
  MCP_SERVER_PATH,
} from '@/lib/mcp'

/**
 * `/settings/mcp` — connect greenthumb to Claude Desktop or Codex. The config is
 * generated from lib/mcp.ts (single source) using the effective API URL, so it
 * always matches the instance the app is talking to.
 */
export default function McpPage() {
  const { cloud } = useSettings()
  const gated = cloud.connected && Boolean(cloud.apiKey)
  const apiUrl = cloud.connected && cloud.url ? cloud.url.replace(/\/+$/, '') : DEFAULT_API_URL

  // Default to a placeholder key (never leak the real secret into copyable text)
  // unless the user opts in for a connected, gated instance.
  const [includeKey, setIncludeKey] = useState(false)
  const key = gated && includeKey ? cloud.apiKey : gated ? '<your-api-key>' : undefined

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Connect MCP</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Let Claude Desktop or Codex read and edit your models directly. The MCP server is a thin
          adapter over the same local API and engine the app uses.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>1. Prerequisites</CardTitle>
          <CardDescription>Build the server and note where it lives.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="space-y-1.5">
            <p className="text-muted-foreground">
              Make sure the API is running (locally that&apos;s <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">{DEFAULT_API_URL}</code>),
              then build the MCP server once:
            </p>
            <CodeBlock code={MCP_BUILD_COMMAND} />
          </div>
          <div className="space-y-1.5">
            <p className="text-muted-foreground">This produces the entrypoint your MCP client runs:</p>
            <CodeBlock code={`node ${MCP_SERVER_PATH}`} />
            <p className="text-xs text-muted-foreground">
              Replace <code className="rounded bg-muted px-1 py-0.5 font-mono">&lt;repo&gt;</code> with
              the absolute path to this repository on your machine.
            </p>
          </div>
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <p>
              The server reads <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">GREENTHUMB_API_URL</code>{' '}
              (currently <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">{apiUrl}</code>).{' '}
              {gated ? (
                <>
                  This instance is gated, so also set{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">GREENTHUMB_API_KEY</code>.
                </>
              ) : (
                <>
                  <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">GREENTHUMB_API_KEY</code>{' '}
                  is only needed when connecting to a gated (cloud) instance.
                </>
              )}
            </p>
          </div>
          {gated && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includeKey}
                onChange={(e) => setIncludeKey(e.target.checked)}
              />
              Insert my connected API key into the snippets below
            </label>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Claude Desktop</CardTitle>
          <CardDescription>
            Add this to <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">claude_desktop_config.json</code>{' '}
            (Settings → Developer → Edit Config), then restart Claude Desktop.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CodeBlock code={claudeDesktopSnippet(apiUrl, key)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Terminal className="size-4" /> 3. Codex
          </CardTitle>
          <CardDescription>
            Add this MCP server to <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">~/.codex/config.toml</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CodeBlock code={codexSnippet(apiUrl, key)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="size-4" /> Troubleshooting
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Trouble
            title="Tools don't appear / connection fails"
            body="Make sure the greenthumb API is running and reachable at the GREENTHUMB_API_URL above. Locally, start it with pnpm dev."
          />
          <Trouble
            title='Error: cannot find module ".../dist/index.js"'
            body="The MCP server isn't built. Run pnpm --filter @greenthumb/mcp build, and confirm the args path points at the real dist/index.js on your machine."
          />
          <Trouble
            title="API 401: Invalid or missing API key"
            body="The target instance is gated. Set GREENTHUMB_API_KEY in the server env to the instance's key. Local mode needs no key."
          />
        </CardContent>
      </Card>
    </div>
  )
}

function Trouble({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="font-medium">{title}</p>
      <p className="mt-0.5 text-muted-foreground">{body}</p>
    </div>
  )
}
