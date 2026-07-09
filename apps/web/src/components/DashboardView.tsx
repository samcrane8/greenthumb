import { lazy, Suspense, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Minus, Plus, X } from 'lucide-react'
import type { ComputedModel, Model, Statement, StatementKind, Widget } from '@greenthumb/core'

import { api, type EditResult } from '@/lib/api'
import { Card } from '@/components/ui/card'
import { StatementGrid } from '@/components/StatementGrid'

// Code-split the charting bundle (recharts) so it loads only when a chart mounts.
const ChartView = lazy(() =>
  import('@/components/ChartView').then((m) => ({ default: m.ChartView }))
)
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Renders a model's dashboard: widgets flow in order across a fixed-column grid,
 * each spanning w×h cells. Edit mode adds per-widget resize / reorder / remove
 * controls, all persisted through the dashboard API. Because widgets flow by
 * array order, reordering is visually meaningful (the stored x/y still travel
 * with each widget for other clients).
 */
export function DashboardView({
  model,
  scenarioId,
  editing,
  onEdit,
}: {
  model: Model
  scenarioId: string | null
  editing: boolean
  onEdit: (res: EditResult) => void
}) {
  const dash = model.dashboard
  const columns = dash?.columns ?? 12
  const [computed, setComputed] = useState<ComputedModel | null>(null)
  const [busy, setBusy] = useState(false)

  // Compute once per model/scenario for the stat widgets.
  useEffect(() => {
    let live = true
    api
      .compute(model.id, scenarioId ?? undefined)
      .then((c) => live && setComputed(c))
      .catch(console.error)
    return () => {
      live = false
    }
  }, [model.id, model.meta.version, scenarioId])

  if (!dash || dash.widgets.length === 0) return null

  const widgets = dash.widgets
  const commit = async (fn: () => Promise<EditResult>) => {
    setBusy(true)
    try {
      onEdit(await fn())
    } catch (e) {
      console.error(e)
    } finally {
      setBusy(false)
    }
  }

  const resize = (w: Widget, dw: number, dh: number) =>
    commit(() =>
      api.updateWidget(model.id, w.id, {
        layout: {
          ...w.layout,
          w: clamp(w.layout.w + dw, 2, columns),
          h: clamp(w.layout.h + dh, 1, 8),
        },
      })
    )

  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir
    if (j < 0 || j >= widgets.length) return
    const order = widgets.map((w) => w.id)
    ;[order[index], order[j]] = [order[j]!, order[index]!]
    return commit(() => api.reorderDashboard(model.id, order))
  }

  const remove = (w: Widget) => commit(() => api.removeWidget(model.id, w.id))

  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridAutoRows: '92px' }}
    >
      {widgets.map((w, i) => (
        <Card
          key={w.id}
          className={cn('relative min-w-0 overflow-hidden p-3.5', busy && 'opacity-70')}
          style={{ gridColumn: `span ${clamp(w.layout.w, 1, columns)}`, gridRow: `span ${Math.max(1, w.layout.h)}` }}
        >
          {editing && (
            <div className="absolute right-1.5 top-1.5 z-10 flex items-center gap-0.5 rounded-md border bg-card/90 p-0.5 backdrop-blur">
              <IconBtn title="Narrower" onClick={() => resize(w, -1, 0)}><Minus className="size-3" /></IconBtn>
              <IconBtn title="Wider" onClick={() => resize(w, 1, 0)}><Plus className="size-3" /></IconBtn>
              <IconBtn title="Shorter" onClick={() => resize(w, 0, -1)}><Minus className="size-3 rotate-90" /></IconBtn>
              <IconBtn title="Taller" onClick={() => resize(w, 0, 1)}><Plus className="size-3 rotate-90" /></IconBtn>
              <span className="mx-0.5 h-3.5 w-px bg-border" />
              <IconBtn title="Move earlier" onClick={() => move(i, -1)}><ChevronLeft className="size-3" /></IconBtn>
              <IconBtn title="Move later" onClick={() => move(i, 1)}><ChevronRight className="size-3" /></IconBtn>
              <IconBtn title="Remove" onClick={() => remove(w)}><X className="size-3 text-[var(--negative)]" /></IconBtn>
            </div>
          )}
          <WidgetBody model={model} widget={w} scenarioId={scenarioId} computed={computed} />
        </Card>
      ))}
    </div>
  )
}

function WidgetBody({
  model,
  widget,
  scenarioId,
  computed,
}: {
  model: Model
  widget: Widget
  scenarioId: string | null
  computed: ComputedModel | null
}) {
  switch (widget.kind) {
    case 'chart': {
      const chart = model.charts?.find((c) => c.id === widget.refId)
      if (!chart) return <Missing what="chart" />
      return (
        <Suspense fallback={<div className="grid h-full place-items-center text-sm text-muted-foreground">Loading chart…</div>}>
          <ChartView
            modelId={model.id}
            chart={chart}
            scenarioId={scenarioId}
            granularity={model.timeline.granularity}
            start={model.timeline.start}
          />
        </Suspense>
      )
    }
    case 'stat':
      return <StatWidget model={model} name={widget.refId ?? ''} computed={computed} />
    case 'statement':
      return (
        <StatementWidget
          model={model}
          kind={(widget.refId as StatementKind) ?? 'kpi'}
          title={widget.title}
          scenarioId={scenarioId}
        />
      )
    case 'note':
      return (
        <div className="text-sm leading-relaxed text-muted-foreground">
          {widget.title && <div className="eyebrow mb-1.5 text-foreground">{widget.title}</div>}
          {widget.text}
        </div>
      )
    default:
      return <Missing what="widget" />
  }
}

/** A headline metric tile: latest value of an item + delta over the horizon. */
function StatWidget({
  model,
  name,
  computed,
}: {
  model: Model
  name: string
  computed: ComputedModel | null
}) {
  const item = model.items.find((i) => i.name === name)
  const series = item ? computed?.series[item.id] : undefined
  if (!item) return <Missing what={`item "${name}"`} />
  const last = model.timeline.periods - 1
  const end = series?.[last] ?? 0
  const start = series?.[0] ?? 0
  const growth = start !== 0 ? end / start - 1 : 0
  const up = growth >= 0
  return (
    <>
      <span
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: start === 0 ? 'var(--border)' : up ? 'var(--positive)' : 'var(--negative)' }}
      />
      <div className="eyebrow">{item.name.replace(/_/g, ' ')}</div>
      <div className="mt-2 font-mono text-2xl font-semibold tabular-nums tracking-tight">
        {formatNumber(end, item.unit)}
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
    </>
  )
}

function StatementWidget({
  model,
  kind,
  title,
  scenarioId,
}: {
  model: Model
  kind: StatementKind
  title?: string
  scenarioId: string | null
}) {
  const [statement, setStatement] = useState<Statement | null>(null)
  useEffect(() => {
    let live = true
    api
      .statement(model.id, kind, scenarioId ?? undefined)
      .then((s) => live && setStatement(s))
      .catch(console.error)
    return () => {
      live = false
    }
  }, [model.id, model.meta.version, kind, scenarioId])

  return (
    <div className="flex h-full flex-col">
      <div className="eyebrow mb-2 shrink-0">{title ?? `${kind.replace('_', ' ')} statement`}</div>
      <div className="min-h-0 flex-1 overflow-auto">
        {statement && statement.rows.length > 0 ? (
          <StatementGrid model={model} statement={statement} />
        ) : (
          <div className="grid h-full place-items-center text-sm text-muted-foreground">
            No {kind.replace('_', ' ')} rows.
          </div>
        )}
      </div>
    </div>
  )
}

function IconBtn({
  onClick,
  title,
  children,
}: {
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="grid size-5 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  )
}

function Missing({ what }: { what: string }) {
  return <div className="grid h-full place-items-center text-sm text-muted-foreground">Missing {what}</div>
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)
