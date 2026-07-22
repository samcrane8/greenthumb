import { useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Boxes, LayoutGrid, Plug, Plus, Sprout, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AccountSection } from '@/components/AccountSection'
import { useWorkspace } from '@/workspace/WorkspaceContext'
import { cn } from '@/lib/utils'
import type { TemplateInfo } from '@/lib/api'

/**
 * The persistent left sidebar (layout shell): brand, primary navigation, the
 * model list + template picker, and the account section pinned to the bottom.
 * Visible on every route so the account section is always reachable.
 */
export function Sidebar() {
  const { models, templates, selectedId, setSelectedId, deleteModel, createModel, busy } =
    useWorkspace()
  const navigate = useNavigate()
  // When a ticker-required template is picked, we prompt for the ticker inline
  // before creating (instead of silently defaulting the company identity).
  const [tickerFor, setTickerFor] = useState<TemplateInfo | null>(null)
  const [ticker, setTicker] = useState('')

  function openModel(id: string) {
    setSelectedId(id)
    navigate('/')
  }

  async function createAndOpen(type: TemplateInfo['type'], label: string, tkr?: string) {
    await createModel(type, label, tkr)
    navigate('/')
  }

  function pickTemplate(t: TemplateInfo) {
    if (t.requiresTicker) {
      setTicker('')
      setTickerFor(t)
    } else {
      void createAndOpen(t.type, t.label)
    }
  }

  async function confirmTicker() {
    if (!tickerFor || !ticker.trim()) return
    const t = tickerFor
    setTickerFor(null)
    await createAndOpen(t.type, t.label, ticker.trim())
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r bg-card">
      <div className="flex items-center gap-2.5 border-b px-3.5 py-3">
        <div className="grid size-6 place-items-center rounded-sm bg-primary text-primary-foreground">
          <Sprout className="size-3.5" />
        </div>
        <span className="font-mono text-[15px] font-semibold lowercase tracking-tight">
          greenthumb
        </span>
      </div>

      <nav className="flex flex-col gap-0.5 border-b p-2">
        <SidebarLink to="/" icon={<LayoutGrid className="size-4" />} label="Workspace" end />
        <SidebarLink to="/commodities" icon={<Boxes className="size-4" />} label="Commodities" />
        <SidebarLink to="/settings/mcp" icon={<Plug className="size-4" />} label="Connect MCP" />
      </nav>

      <div className="flex-1 overflow-y-auto p-2">
        <div className="eyebrow px-2 pb-1.5 pt-1">Models</div>
        {models.map((m) => (
          <button
            key={m.id}
            onClick={() => openModel(m.id)}
            className={cn(
              'group relative flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
              selectedId === m.id &&
                "bg-accent font-medium text-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-primary before:content-['']"
            )}
          >
            <span className="min-w-0 flex-1 truncate">{m.name}</span>
            <Trash2
              className="size-3.5 shrink-0 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation()
                void deleteModel(m.id)
              }}
            />
          </button>
        ))}
        {models.length === 0 && (
          <p className="px-2.5 py-2 text-sm text-muted-foreground">No models yet.</p>
        )}
      </div>

      <div className="border-t p-2">
        <div className="eyebrow px-2 pb-1.5 pt-1">New from template</div>
        {templates.map((t) => (
          <Button
            key={t.type}
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground hover:text-foreground"
            disabled={busy}
            onClick={() => pickTemplate(t)}
          >
            <Plus className="size-4" /> {t.label}
          </Button>
        ))}
        {tickerFor && (
          <div className="mt-1.5 rounded-md border bg-background p-2">
            <label className="eyebrow px-0.5 pb-1 block">Ticker for {tickerFor.label}</label>
            <div className="flex gap-1.5">
              <Input
                autoFocus
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void confirmTicker()
                  if (e.key === 'Escape') setTickerFor(null)
                }}
                placeholder="e.g. MSTR"
                className="h-8"
              />
              <Button
                size="sm"
                className="h-8 shrink-0"
                disabled={busy || !ticker.trim()}
                onClick={() => void confirmTicker()}
              >
                Create
              </Button>
            </div>
          </div>
        )}
      </div>

      <AccountSection />
    </aside>
  )
}

function SidebarLink({
  to,
  icon,
  label,
  end,
}: {
  to: string
  icon: ReactNode
  label: string
  end?: boolean
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'relative flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&_svg]:size-4 [&_svg]:text-muted-foreground',
          isActive &&
            "bg-accent text-foreground [&_svg]:text-primary before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-primary before:content-['']"
        )
      }
    >
      {icon}
      {label}
    </NavLink>
  )
}
