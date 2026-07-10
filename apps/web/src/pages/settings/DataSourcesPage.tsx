import { useEffect, useState } from 'react'
import { Database, Loader2, CheckCircle2, Download } from 'lucide-react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/lib/api'
import { useWorkspace } from '@/workspace/WorkspaceContext'

type Provider = { id: string; label: string; requiresKey: boolean; configured: boolean }

/**
 * `/settings/data-sources` — configure market-data providers (choose a provider,
 * store a key in LOCAL config, test the connection) and import a ticker's history
 * into the current model's actuals. Keys are never displayed or persisted client-side.
 */
export default function DataSourcesPage() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [error, setError] = useState<string | null>(null)

  const refresh = () => api.dataProviders().then(setProviders).catch((e) => setError(e.message))
  useEffect(() => {
    refresh()
  }, [])

  return (
    <div className="space-y-5">
      <div>
        <div className="eyebrow mb-1.5 flex items-center gap-1.5">
          <Database className="size-3.5" /> Data sources
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Market data</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
          Pull stock/price history into a model's actuals and seed assumptions from live quotes.
          Fetching is explicit — models never change on their own. Keys stay in local config and
          are never stored in a model.
        </p>
      </div>

      {error && <div className="rounded-lg border p-3 text-sm text-[var(--negative)]">{error}</div>}

      <div className="space-y-3">
        {providers.map((p) => (
          <ProviderCard key={p.id} provider={p} onChange={refresh} />
        ))}
      </div>

      <ImportPanel providers={providers} />
    </div>
  )
}

function ProviderCard({ provider, onChange }: { provider: Provider; onChange: () => void }) {
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [test, setTest] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    try {
      await api.setProviderKey(provider.id, key)
      setKey('')
      onChange()
    } finally {
      setBusy(false)
    }
  }

  async function testConnection() {
    setBusy(true)
    setTest(null)
    try {
      const q = await api.marketQuote('AAPL', provider.id)
      setTest(`OK — AAPL ≈ $${q.price} (${q.source})`)
    } catch (e) {
      setTest(`Failed: ${e instanceof Error ? e.message : 'error'}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {provider.label}
          {provider.configured && (
            <span className="inline-flex items-center gap-1 text-xs font-normal text-[var(--positive)]">
              <CheckCircle2 className="size-3.5" /> configured
            </span>
          )}
        </CardTitle>
        <CardDescription>
          {provider.requiresKey ? 'Requires an API key (stored in local config only).' : 'No API key required.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {provider.requiresKey && (
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label htmlFor={`key-${provider.id}`}>API key</Label>
              <Input
                id={`key-${provider.id}`}
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={provider.configured ? '•••••••• (set — enter to replace)' : 'paste key'}
              />
            </div>
            <Button onClick={save} disabled={busy || !key}>
              Save
            </Button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={testConnection} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : 'Test connection'}
          </Button>
          {test && <span className="text-xs text-muted-foreground">{test}</span>}
        </div>
      </CardContent>
    </Card>
  )
}

/** Import a ticker's price history into the currently-selected model's actuals. */
function ImportPanel({ providers }: { providers: Provider[] }) {
  const { model } = useWorkspace()
  const [symbol, setSymbol] = useState('')
  const [item, setItem] = useState('')
  const [provider, setProvider] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    if (model && !item) setItem(model.items[0]?.name ?? '')
  }, [model, item])

  if (!model) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Import actuals from a ticker</CardTitle>
          <CardDescription>Select a model in the workspace first.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  async function run() {
    setBusy(true)
    setMsg(null)
    try {
      const res = await api.importMarketActuals(model!.id, symbol, item, provider || undefined)
      setMsg(`Imported ${res.ingested} periods into "${res.item}" from ${res.source} (actuals through period ${res.actualsThrough + 1}).`)
    } catch (e) {
      setMsg(`Failed: ${e instanceof Error ? e.message : 'error'}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Download className="size-4" /> Import actuals into “{model.meta.name}”
        </CardTitle>
        <CardDescription>Fetch a symbol's price history and store it as actuals for an item — feeds backtesting.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label htmlFor="mkt-symbol">Symbol</Label>
            <Input id="mkt-symbol" value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="MSTR" />
          </div>
          <div>
            <Label htmlFor="mkt-item">Item</Label>
            <select
              id="mkt-item"
              value={item}
              onChange={(e) => setItem(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border bg-background px-2.5 text-sm"
            >
              {model.items.map((i) => (
                <option key={i.id} value={i.name}>
                  {i.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="mkt-provider">Provider</Label>
            <select
              id="mkt-provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="mt-1 h-9 w-full rounded-md border bg-background px-2.5 text-sm"
            >
              <option value="">default</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={run} disabled={busy || !symbol || !item}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : 'Import'}
          </Button>
          {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
        </div>
      </CardContent>
    </Card>
  )
}
