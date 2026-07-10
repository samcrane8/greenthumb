import type { Statement } from '@greenthumb/core'
import { Card } from '@/components/ui/card'
import { formatNumber, unitHint } from '@/lib/format'

const HEADLINE = ['arr', 'mrr', 'ebitda', 'gross_profit', 'customers']

/** Headline KPI tiles: latest-period value of a few key rows, with delta vs. first. */
export function StatTiles({ statement }: { statement: Statement }) {
  const rows = statement.rows
    .filter((r) => HEADLINE.includes(r.name))
    .sort((a, b) => HEADLINE.indexOf(a.name) - HEADLINE.indexOf(b.name))

  if (rows.length === 0) return null
  const last = statement.periods - 1

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
      {rows.map((r) => {
        const end = r.values[last] ?? 0
        const start = r.values[0] ?? 0
        const growth = start !== 0 ? end / start - 1 : 0
        const up = growth >= 0
        return (
          <Card key={r.itemId} className="relative overflow-hidden p-3.5">
            {/* Signal top-rule: green on upside, red on downside. */}
            <span
              className="absolute inset-x-0 top-0 h-px"
              style={{
                background:
                  start === 0
                    ? 'var(--border)'
                    : up
                      ? 'var(--positive)'
                      : 'var(--negative)',
              }}
            />
            <div className="eyebrow">
              {r.name.replace(/_/g, ' ')}
              {unitHint(r.unit) && <span className="ml-1 text-muted-foreground">({unitHint(r.unit)})</span>}
            </div>
            <div className="mt-2 font-mono text-2xl font-semibold tabular-nums tracking-tight">
              {formatNumber(end, r.unit, r.scale)}
            </div>
            {start !== 0 && (
              <div
                className="mt-1.5 font-mono text-[11px] font-medium tabular-nums"
                style={{ color: up ? 'var(--positive)' : 'var(--negative)' }}
              >
                {up ? '▲' : '▼'} {Math.abs(growth * 100).toFixed(0)}%
                <span className="ml-1 text-muted-foreground">horizon</span>
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}
