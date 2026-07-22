import { AlertTriangle, CheckCircle2, LayoutGrid, Loader2, Pencil, Plus } from 'lucide-react'
import type { StatementKind } from '@greenthumb/core'

import { Badge } from '@/components/ui/badge'
import { StatTiles } from '@/components/StatTiles'
import { StatementGrid } from '@/components/StatementGrid'
import { DashboardView } from '@/components/DashboardView'
import { DriverPanel } from '@/components/DriverPanel'
import { CommodityScenarioPanel } from '@/components/CommodityScenarioPanel'
import { CapitalStackPanel } from '@/components/CapitalStackPanel'
import { api } from '@/lib/api'
import { useWorkspace } from '@/workspace/WorkspaceContext'
import { cn } from '@/lib/utils'

const STATEMENTS: { kind: StatementKind; label: string }[] = [
  { kind: 'income', label: 'Income' },
  { kind: 'balance_sheet', label: 'Balance Sheet' },
  { kind: 'cash_flow', label: 'Cash Flow' },
  { kind: 'kpi', label: 'KPIs' },
]

/** The model workspace — dashboard (or statements), scenarios, drivers. Mounted at `/`. */
export default function WorkspacePage() {
  const {
    templates,
    model,
    scenarioId,
    setScenarioId,
    issues,
    busy,
    errorCount,
    editing,
    setEditing,
    setScalar,
    applyEdit,
  } = useWorkspace()

  if (!model) return <EmptyState hasTemplates={templates.length > 0} />

  const hasDashboard = !!model.dashboard && model.dashboard.widgets.length > 0

  return (
    <div className="view-enter mx-auto max-w-[1400px] space-y-5 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="eyebrow mb-1.5">{model.meta.type.replace(/_/g, ' ')} model</div>
          <h1 className="text-xl font-semibold tracking-tight">{model.meta.name}</h1>
          <div className="mt-1.5 flex items-center gap-2.5 font-mono text-xs text-muted-foreground">
            <span>{model.timeline.granularity}</span>
            <span className="text-border">/</span>
            <span>{model.timeline.periods} periods</span>
            <span className="text-border">/</span>
            <span>v{model.meta.version}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasDashboard && (
            <button
              onClick={() => setEditing(!editing)}
              className={cn(
                'flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm font-medium transition-colors',
                editing
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <Pencil className="size-3.5" /> {editing ? 'Done' : 'Edit layout'}
            </button>
          )}
          {errorCount === 0 ? (
            <Badge variant="success">
              <CheckCircle2 className="size-3" /> Valid
            </Badge>
          ) : (
            <Badge variant="destructive">
              <AlertTriangle className="size-3" /> {errorCount} issue
              {errorCount > 1 ? 's' : ''}
            </Badge>
          )}
          {busy && <Loader2 className="size-4 animate-spin text-primary" />}
        </div>
      </div>

      {/* Scenario switcher */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="eyebrow mr-1">Scenario</span>
        <div className="flex flex-wrap gap-1 rounded-md border bg-card p-0.5">
          {model.scenarios.map((s) => (
            <button
              key={s.id}
              onClick={() => setScenarioId(s.id)}
              className={cn(
                'rounded-[3px] px-2.5 py-1 text-sm font-medium transition-colors',
                scenarioId === s.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      {editing && hasDashboard && <AddWidgetBar />}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-3">
          {hasDashboard ? (
            <DashboardView
              model={model}
              scenarioId={scenarioId}
              editing={editing}
              onEdit={applyEdit}
            />
          ) : (
            <StatementFallback />
          )}

          {errorCount > 0 && (
            <div className="space-y-1.5 rounded-lg border border-[color-mix(in_oklch,var(--negative)_40%,transparent)] bg-[color-mix(in_oklch,var(--negative)_7%,transparent)] p-4">
              {issues.map((i, idx) => (
                <div key={idx} className="text-sm">
                  <span className="font-mono text-xs font-medium uppercase tracking-wide text-[var(--negative)]">
                    {i.code}
                  </span>{' '}
                  <span className="text-muted-foreground">— {i.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-5">
          <CapitalStackPanel />
          <CommodityScenarioPanel />
          <DriverPanel model={model} onSetScalar={setScalar} busy={busy} />
        </div>
      </div>
    </div>
  )
}

/** Edit-mode toolbar: append a widget to the dashboard. */
function AddWidgetBar() {
  const { model, applyEdit } = useWorkspace()
  if (!model) return null
  const add = async (input: Parameters<typeof api.addWidget>[1]) => {
    try {
      applyEdit(await api.addWidget(model.id, input))
    } catch (e) {
      console.error(e)
    }
  }
  const firstChart = model.charts?.[0]
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2.5">
      <span className="eyebrow mr-1">Add widget</span>
      {firstChart && (
        <AddBtn onClick={() => add({ kind: 'chart', refId: firstChart.id, layout: { x: 0, y: 0, w: 6, h: 3 } })}>
          Chart
        </AddBtn>
      )}
      <AddBtn onClick={() => add({ kind: 'statement', refId: 'kpi', title: 'KPI table', layout: { x: 0, y: 0, w: 12, h: 4 } })}>
        KPI table
      </AddBtn>
      <AddBtn onClick={() => add({ kind: 'note', text: 'New note', title: 'Note', layout: { x: 0, y: 0, w: 4, h: 2 } })}>
        Note
      </AddBtn>
    </div>
  )
}

function AddBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 rounded-md border px-2.5 py-1 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <Plus className="size-3.5" /> {children}
    </button>
  )
}

/** Fallback for models without a dashboard: the classic statement grid + tabs. */
function StatementFallback() {
  const { model, statement, kind, setKind } = useWorkspace()
  if (!model) return null
  return (
    <>
      {statement && <StatTiles statement={statement} />}
      <div className="flex gap-0.5 rounded-md border bg-card p-0.5">
        {STATEMENTS.map((s) => (
          <button
            key={s.kind}
            onClick={() => setKind(s.kind)}
            className={cn(
              'flex-1 rounded-[3px] px-3 py-1.5 text-sm font-medium transition-colors',
              kind === s.kind
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
      {statement && statement.rows.length > 0 ? (
        <StatementGrid model={model} statement={statement} />
      ) : (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          No {kind.replace('_', ' ')} rows in this model.
        </div>
      )}
    </>
  )
}

function EmptyState({ hasTemplates }: { hasTemplates: boolean }) {
  return (
    <div className="grid h-full place-items-center p-8 text-center">
      <div className="max-w-md space-y-2">
        <LayoutGrid className="mx-auto size-10 text-muted-foreground" />
        <h2 className="text-lg font-semibold">No model selected</h2>
        <p className="text-sm text-muted-foreground">
          {hasTemplates
            ? 'Create a model from a template in the sidebar, or ask Claude to scaffold one via the MCP server.'
            : 'Start the API, then create a model from a template.'}
        </p>
      </div>
    </div>
  )
}
