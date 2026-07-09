import { useState } from 'react'
import type { Model } from '@greenthumb/core'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * Driver panel — edit the assumptions that scenarios override and sensitivities
 * sweep (PRD §6). Editing a scalar driver here writes back through the engine
 * and triggers a recompute. Series drivers are shown read-only for the scaffold.
 */
export function DriverPanel({
  model,
  onSetScalar,
  busy,
}: {
  model: Model
  onSetScalar: (driverId: string, value: number) => void
  busy: boolean
}) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="eyebrow !text-[11px]">Drivers &amp; assumptions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        {model.drivers.map((d) => (
          <DriverRow
            key={d.id}
            name={d.name}
            unit={d.unit}
            scalar={d.shape === 'scalar'}
            value={d.values[0] ?? 0}
            onCommit={(v) => onSetScalar(d.id, v)}
            busy={busy}
          />
        ))}
        {model.drivers.length === 0 && (
          <p className="text-sm text-muted-foreground">No drivers yet.</p>
        )}
      </CardContent>
    </Card>
  )
}

function DriverRow({
  name,
  unit,
  scalar,
  value,
  onCommit,
  busy,
}: {
  name: string
  unit: string
  scalar: boolean
  value: number
  onCommit: (v: number) => void
  busy: boolean
}) {
  const [draft, setDraft] = useState(String(value))
  const dirty = Number(draft) !== value

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{name.replace(/_/g, ' ')}</div>
        <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {unit}
        </div>
      </div>
      {scalar ? (
        <div className="flex items-center gap-1.5">
          <input
            className="h-8 w-24 rounded-md border border-input bg-background px-2 text-right font-mono text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={draft}
            inputMode="decimal"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && dirty && !Number.isNaN(Number(draft))) onCommit(Number(draft))
            }}
          />
          <Button
            size="sm"
            variant={dirty ? 'default' : 'ghost'}
            disabled={!dirty || busy || Number.isNaN(Number(draft))}
            onClick={() => onCommit(Number(draft))}
          >
            Set
          </Button>
        </div>
      ) : (
        <span className="rounded-sm border border-border/70 bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          series
        </span>
      )}
    </div>
  )
}
