import { lazy, Suspense, useEffect, useState } from 'react'
import { Layers } from 'lucide-react'

import { api, type CapitalStackAnalysis } from '@/lib/api'
import { Card } from '@/components/ui/card'
import { useWorkspace } from '@/workspace/WorkspaceContext'
import { formatNumber, periodLabel } from '@/lib/format'
import { cn } from '@/lib/utils'

const PreviewChart = lazy(() =>
  import('@/components/PreviewChart').then((m) => ({ default: m.PreviewChart }))
)

/**
 * Scenario-aware capital-stack waterfall. Shows the ranked tranches (claim,
 * coverage, recovery) at the last period, the residual-to-common headline, and
 * residual-to-common over time. Only rendered when the model carries a stack.
 */
export function CapitalStackPanel() {
  const { model, scenarioId } = useWorkspace()
  const [a, setA] = useState<CapitalStackAnalysis | null>(null)
  const [error, setError] = useState<string | null>(null)

  const hasStack = !!model?.capitalStack && model.capitalStack.tranches.length > 0

  useEffect(() => {
    if (!model || !hasStack) return
    let live = true
    setError(null)
    api
      .capitalStackAnalysis(model.id, scenarioId ?? undefined)
      .then((res) => live && setA(res))
      .catch((e) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [model?.id, model?.meta.version, scenarioId, hasStack])

  if (!model || !hasStack) return null

  // Monetary series are in the model's unit ($M) — scale to true magnitude for display.
  const scale = model.meta.defaultScale ?? 1
  const last = model.timeline.periods - 1
  const money = (v: number) => formatNumber(v * scale, 'currency')

  return (
    <Card className="p-4">
      <div className="eyebrow mb-1 flex items-center gap-1.5">
        <Layers className="size-3.5" /> Capital stack
      </div>
      {error && <div className="text-sm text-[var(--negative)]">{error}</div>}
      {a && (
        <>
          <div className="mb-3 grid grid-cols-3 gap-2">
            <Metric label="residual → common" value={money(a.residualToCommon[last] ?? 0)} />
            <Metric label="NAV / share" value={formatNumber(a.navPerShare[last] ?? 0, 'currency')} />
            <Metric label="implied leverage" value={`${(a.impliedLeverage[last] ?? 0).toFixed(2)}×`} />
          </div>

          <div className="-mx-1 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-1 py-1 font-medium">Tranche</th>
                  <th className="px-1 py-1 text-right font-medium">Seniority</th>
                  <th className="px-1 py-1 text-right font-medium">Claim</th>
                  <th className="px-1 py-1 text-right font-medium">Coverage</th>
                  <th className="px-1 py-1 text-right font-medium">Recovery</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                {[...a.tranches]
                  .sort((x, y) => x.seniority - y.seniority)
                  .map((t) => {
                    const rec = t.recovery[last] ?? (t.kind === 'common' ? 1 : 0)
                    const isCommon = t.kind === 'common'
                    return (
                      <tr key={t.id} className="border-b border-border/50">
                        <td className="px-1 py-1">
                          <span className="font-sans">{t.name}</span>
                          <span className="ml-1 text-[10px] text-muted-foreground">{t.kind.replace(/_/g, ' ')}</span>
                        </td>
                        <td className="px-1 py-1 text-right text-muted-foreground">{t.seniority}</td>
                        <td className="px-1 py-1 text-right">{isCommon ? '—' : money(t.claim[last] ?? 0)}</td>
                        <td className="px-1 py-1 text-right">{isCommon ? '—' : `${(t.coverage[last] ?? 0).toFixed(2)}×`}</td>
                        <td
                          className={cn('px-1 py-1 text-right', !isCommon && rec < 1 && 'text-[var(--negative)]')}
                        >
                          {isCommon ? '—' : `${Math.round(rec * 100)}%`}
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>

          <div className="eyebrow mt-3 mb-1">residual to common over time</div>
          <Suspense fallback={<div className="h-[160px]" />}>
            <PreviewChart
              height={160}
              series={a.residualToCommon.map((v) => v * scale)}
              labels={a.residualToCommon.map((_, i) =>
                periodLabel(model.timeline.start, model.timeline.granularity, i)
              )}
            />
          </Suspense>
        </>
      )}
    </Card>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className="mt-0.5 font-mono text-lg font-semibold tabular-nums">{value}</div>
    </div>
  )
}
