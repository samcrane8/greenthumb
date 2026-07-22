import type { Model, Statement } from '@greenthumb/core'
import { formatNumber, itemLabel, periodLabel, unitHint } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * The statement grid — a virtualization-ready table of item rows × periods. For
 * the scaffold it renders directly; a large-model build swaps in a virtualized
 * body (PRD §12 performance). Actuals periods are tinted to mark the cutover.
 */
export function StatementGrid({
  model,
  statement,
}: {
  model: Model
  statement: Statement
}) {
  const { timeline } = model
  const periods = Array.from({ length: statement.periods }, (_, i) => i)

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="sticky left-0 z-10 bg-muted/50 px-4 py-2 text-left">
              <span className="eyebrow">Line item</span>
            </th>
            {periods.map((p) => {
              const actual = p <= timeline.actualsThrough
              return (
                <th
                  key={p}
                  className={cn(
                    'min-w-20 px-3 py-2 text-right font-mono text-[11px] uppercase tracking-wider',
                    actual ? 'text-primary' : 'text-muted-foreground'
                  )}
                >
                  {periodLabel(timeline.start, timeline.granularity, p)}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {statement.rows.map((row) => (
            <tr
              key={row.itemId}
              className="border-b border-border/60 last:border-0 hover:bg-accent/40"
            >
              <td className="sticky left-0 z-10 bg-card px-4 py-1.5">
                <span className="font-medium">{itemLabel(row.name, model.meta.ticker)}</span>
                {unitHint(row.unit) && (
                  <span className="eyebrow ml-2 align-middle text-muted-foreground">{unitHint(row.unit)}</span>
                )}
                <span className="eyebrow ml-2 align-middle">{row.category}</span>
              </td>
              {periods.map((p) => {
                const v = row.values[p] ?? 0
                return (
                  <td
                    key={p}
                    className={cn(
                      'px-3 py-1.5 text-right font-mono tabular-nums',
                      v < 0 && 'text-[var(--negative)]',
                      p <= timeline.actualsThrough &&
                        'bg-[color-mix(in_oklch,var(--primary)_7%,transparent)]'
                    )}
                  >
                    {formatNumber(v, row.unit, row.scale)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
