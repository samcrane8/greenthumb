import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Model, Statement, StatementKind, ValidationIssue } from '@greenthumb/core'

import { api, type EditResult, type ModelListItem, type TemplateInfo } from '@/lib/api'

/**
 * The model-workspace state, lifted out of the page so the persistent sidebar
 * (model list + templates) and the workspace main pane share one source of
 * truth across route changes. Behavior is unchanged from the original single
 * App component — only the ownership of the state moved up to a provider.
 */

interface WorkspaceValue {
  models: ModelListItem[]
  templates: TemplateInfo[]
  selectedId: string | null
  setSelectedId: (id: string | null) => void
  model: Model | null
  scenarioId: string | null
  setScenarioId: (id: string | null) => void
  kind: StatementKind
  setKind: (kind: StatementKind) => void
  statement: Statement | null
  issues: ValidationIssue[]
  busy: boolean
  errorCount: number
  editing: boolean
  setEditing: (v: boolean) => void
  createModel: (type: TemplateInfo['type'], label: string, ticker?: string) => Promise<void>
  deleteModel: (id: string) => Promise<void>
  setScalar: (driverId: string, value: number) => Promise<void>
  /** Fold an edit result (from a chart/dashboard mutation) back into state. */
  applyEdit: (res: EditResult) => void
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [models, setModels] = useState<ModelListItem[]>([])
  const [templates, setTemplates] = useState<TemplateInfo[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [model, setModel] = useState<Model | null>(null)
  const [scenarioId, setScenarioId] = useState<string | null>(null)
  const [kind, setKind] = useState<StatementKind>('income')
  const [statement, setStatement] = useState<Statement | null>(null)
  const [issues, setIssues] = useState<ValidationIssue[]>([])
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)

  const refreshModels = useCallback(async () => {
    const list = await api.listModels()
    setModels(list)
    return list
  }, [])

  // Initial load.
  useEffect(() => {
    ;(async () => {
      const [list, tpls] = await Promise.all([api.listModels(), api.templates()])
      setModels(list)
      setTemplates(tpls)
      if (list[0]) setSelectedId(list[0].id)
    })().catch(console.error)
  }, [])

  // Load the selected model + its validation.
  useEffect(() => {
    if (!selectedId) {
      setModel(null)
      return
    }
    ;(async () => {
      const m = await api.getModel(selectedId)
      setModel(m)
      setScenarioId(m.scenarios[0]?.id ?? null)
      const v = await api.validate(selectedId)
      setIssues(v.issues)
    })().catch(console.error)
  }, [selectedId])

  // Recompute the visible statement whenever model / scenario / kind changes.
  useEffect(() => {
    if (!model || !scenarioId) return
    ;(async () => {
      setStatement(await api.statement(model.id, kind, scenarioId))
    })().catch(console.error)
  }, [model, scenarioId, kind])

  const createModel = useCallback(
    async (type: TemplateInfo['type'], label: string, ticker?: string) => {
      setBusy(true)
      try {
        const { model: created } = await api.createModel({ name: `${label} model`, type, ticker })
        await refreshModels()
        setSelectedId(created.id)
      } finally {
        setBusy(false)
      }
    },
    [refreshModels]
  )

  const setScalar = useCallback(
    async (driverId: string, value: number) => {
      if (!model) return
      setBusy(true)
      try {
        const res = await api.setAssumption(model.id, driverId, [value])
        setIssues(res.issues)
        setModel(res.model)
      } finally {
        setBusy(false)
      }
    },
    [model]
  )

  const deleteModel = useCallback(
    async (id: string) => {
      setBusy(true)
      try {
        await api.deleteModel(id)
        const list = await refreshModels()
        setSelectedId(list[0]?.id ?? null)
      } finally {
        setBusy(false)
      }
    },
    [refreshModels]
  )

  const applyEdit = useCallback((res: EditResult) => {
    setModel(res.model)
    setIssues(res.issues)
  }, [])

  const errorCount = issues.filter((i) => i.severity === 'error').length

  const value: WorkspaceValue = {
    models,
    templates,
    selectedId,
    setSelectedId,
    model,
    scenarioId,
    setScenarioId,
    kind,
    setKind,
    statement,
    issues,
    busy,
    errorCount,
    editing,
    setEditing,
    createModel,
    deleteModel,
    setScalar,
    applyEdit,
  }

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace(): WorkspaceValue {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used within a WorkspaceProvider')
  return ctx
}
