import { useEffect, useState } from 'react'
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Chart, ChartData } from '@greenthumb/core'

import { api } from '@/lib/api'
import { periodLabel } from '@/lib/format'

/**
 * Renders a persisted Chart by fetching its derived data for the active scenario
 * and mapping series to recharts marks. A ComposedChart backs every kind so a
 * single chart can mix bars, lines, and areas (as the treasury coverage chart
 * does); a plain "line"/"area"/"bar" chart is just the degenerate case.
 */

// Brand-neutral categorical palette; series cycle through it in order.
const COLORS = ['#f97316', '#0ea5e9', '#22c55e', '#a855f7', '#eab308', '#ef4444']

export function ChartView({
  modelId,
  chart,
  scenarioId,
  granularity,
  start,
}: {
  modelId: string
  chart: Chart
  scenarioId: string | null
  granularity: string
  start: string
}) {
  const [data, setData] = useState<ChartData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    setError(null)
    api
      .chartData(modelId, chart.id, scenarioId ?? undefined)
      .then((d) => live && setData(d))
      .catch((e) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [modelId, chart.id, scenarioId])

  const rows = (data?.rows ?? []).map((r) => ({
    ...r,
    label: periodLabel(start, granularity, r.period as number),
  }))
  const hasRightAxis = chart.series.some((s) => s.axis === 'right')

  return (
    <div className="flex h-full flex-col">
      <div className="eyebrow mb-2 shrink-0">{chart.title}</div>
      {error ? (
        <div className="grid flex-1 place-items-center text-sm text-muted-foreground">{error}</div>
      ) : (
        <div className="min-h-0 flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="2 3" vertical={false} />
              <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={10} tickMargin={6} />
              <YAxis yAxisId="left" stroke="var(--muted-foreground)" fontSize={10} width={44} />
              {hasRightAxis && (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="var(--muted-foreground)"
                  fontSize={10}
                  width={36}
                />
              )}
              <Tooltip
                contentStyle={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              {chart.series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
              {chart.series.map((s, i) => {
                const color = COLORS[i % COLORS.length]
                const axisId = s.axis === 'right' ? 'right' : 'left'
                const label = s.label ?? s.ref
                const style = s.style ?? kindDefaultStyle(chart.kind)
                if (style === 'bar') {
                  return <Bar key={s.ref} yAxisId={axisId} dataKey={label} fill={color} name={label} />
                }
                if (style === 'area') {
                  return (
                    <Area
                      key={s.ref}
                      yAxisId={axisId}
                      type="monotone"
                      dataKey={label}
                      stroke={color}
                      fill={color}
                      fillOpacity={0.15}
                      name={label}
                    />
                  )
                }
                return (
                  <Line
                    key={s.ref}
                    yAxisId={axisId}
                    type="monotone"
                    dataKey={label}
                    stroke={color}
                    strokeWidth={2}
                    dot={false}
                    name={label}
                  />
                )
              })}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

function kindDefaultStyle(kind: Chart['kind']): 'line' | 'bar' | 'area' {
  if (kind === 'bar') return 'bar'
  if (kind === 'area') return 'area'
  return 'line'
}
