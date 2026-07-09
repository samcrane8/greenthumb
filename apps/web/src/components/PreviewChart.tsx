import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

/**
 * A small model-independent line chart for previewing a generated price path
 * (commodity price models). Shares the recharts theming used by ChartView, but
 * is fed directly by a { series, labels } pair rather than a model's chart data.
 */
export function PreviewChart({
  series,
  labels,
  height = 220,
}: {
  series: number[]
  labels: string[]
  height?: number
}) {
  const rows = series.map((value, i) => ({ label: labels[i] ?? String(i), value }))
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={rows} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="2 3" vertical={false} />
        <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={10} tickMargin={6} minTickGap={24} />
        <YAxis
          stroke="var(--muted-foreground)"
          fontSize={10}
          width={52}
          tickFormatter={(v: number) => compact(v)}
        />
        <Tooltip
          contentStyle={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(v) => compact(Number(v))}
        />
        <Line type="monotone" dataKey="value" stroke="#f97316" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

function compact(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `$${(v / 1_000).toFixed(0)}K`
  return `$${v.toFixed(0)}`
}
