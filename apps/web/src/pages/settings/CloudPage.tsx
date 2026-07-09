import { useState } from 'react'
import { Cloud, Loader2 } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSettings, connectCloud, disconnectCloud } from '@/settings/store'
import { probeInfo } from '@/lib/api'

/** `/settings/cloud` — connect the client to a hosted instance (optional). */
export default function CloudPage() {
  const { cloud } = useSettings()
  const [url, setUrl] = useState(cloud.url)
  const [apiKey, setApiKey] = useState(cloud.apiKey)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function connect() {
    setBusy(true)
    setErr(null)
    try {
      await probeInfo(url, apiKey)
      connectCloud(url, apiKey)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not connect')
    } finally {
      setBusy(false)
    }
  }

  function disconnect() {
    disconnectCloud()
    setUrl('')
    setApiKey('')
    setErr(null)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cloud connection</CardTitle>
        <CardDescription>
          Optional. Point this app at a hosted greenthumb instance. Leave disconnected to work against
          the local API.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {cloud.connected ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 p-3">
            <div className="flex items-center gap-2 text-sm">
              <Cloud className="size-4 text-primary" />
              <span>
                Connected to <span className="font-medium">{cloud.url}</span>
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={disconnect}>
              Disconnect
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="cloud-url">Instance URL</Label>
              <Input
                id="cloud-url"
                value={url}
                placeholder="https://acme.greenthumb.app"
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cloud-key">API key</Label>
              <Input
                id="cloud-key"
                type="password"
                value={apiKey}
                placeholder="Bearer key for the instance"
                onChange={(e) => setApiKey(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Stored on this device only, sent as a bearer token to the instance you choose.
              </p>
            </div>
            {err && <p className="text-sm text-destructive">{err}</p>}
            <Button onClick={() => void connect()} disabled={busy || !url.trim()}>
              {busy && <Loader2 className="size-4 animate-spin" />} Connect
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
