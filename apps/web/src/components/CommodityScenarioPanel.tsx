import { useEffect, useRef, useState } from 'react'
import { Boxes } from 'lucide-react'
import type { CommodityPriceBinding, Driver, Model } from '@greenthumb/core'

import { api, type EditResult } from '@/lib/api'
import { Card } from '@/components/ui/card'
import { useWorkspace } from '@/workspace/WorkspaceContext'

/**
 * Scenario-scoped commodity assumptions. For the workspace's active scenario, lists
 * the model's commodity-priced drivers and lets the user adjust each one's price-model
 * parameters FOR THAT SCENARIO — editing the base scenario moves the model's baseline,
 * an alternate is a localized what-if. Controls seed from the scenario's own binding
 * when present, otherwise the inherited base binding. Recomputes on change.
 */
export function CommodityScenarioPanel() {
  const { model, scenarioId, applyEdit } = useWorkspace()
  if (!model || !scenarioId) return null

  const priced = model.drivers.filter((d) => d.priceModel)
  if (priced.length === 0) return null

  const scenario = model.scenarios.find((s) => s.id === scenarioId)
  const isBase = scenario ? isBaseScenario(model, scenario.id) : false

  return (
    <Card className="p-4">
      <div className="eyebrow mb-1 flex items-center gap-1.5">
        <Boxes className="size-3.5" /> Commodity assumptions
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        {isBase
          ? 'Editing the Base scenario moves the whole model’s commodity path.'
          : `What-if for “${scenario?.name}” only — the base is unchanged.`}
      </p>
      <div className="space-y-4">
        {priced.map((d) => (
          <DriverCommodityControls
            key={d.id}
            model={model}
            scenarioId={scenarioId}
            driver={d}
            onEdit={applyEdit}
          />
        ))}
      </div>
    </Card>
  )
}

function DriverCommodityControls({
  model,
  scenarioId,
  driver,
  onEdit,
}: {
  model: Model
  scenarioId: string
  driver: Driver
  onEdit: (res: EditResult) => void
}) {
  const scenario = model.scenarios.find((s) => s.id === scenarioId)!
  const scenarioBinding = scenario.priceModels?.[driver.id]
  const effective: CommodityPriceBinding = scenarioBinding ?? driver.priceModel!
  const inherited = !scenarioBinding && !isBaseScenario(model, scenarioId)

  // Local control state, seeded from the effective binding.
  const num = (k: string, dflt: number) => Number(effective.params[k] ?? dflt)
  const [spot, setSpot] = useState<number>(num('spot', 62850))
  const [band, setBand] = useState<string>(String(effective.params.band ?? 'fair'))
  const [amplitude, setAmplitude] = useState<number>(num('amplitude', 0.55))
  const [cycleYears, setCycleYears] = useState<number>(num('cycleYears', 4))

  // Re-seed when the scenario or driver changes (e.g. the scenario switcher moved).
  useEffect(() => {
    setSpot(num('spot', 62850))
    setBand(String(effective.params.band ?? 'fair'))
    setAmplitude(num('amplitude', 0.55))
    setCycleYears(num('cycleYears', 4))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarioId, driver.id])

  // Debounced apply. Skip the first render so seeding doesn't immediately write.
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const t = setTimeout(() => {
      const params: Record<string, number | string> = { spot, band, amplitude, cycleYears }
      api
        .setScenarioCommodityPrice(model.id, scenarioId, driver.id, {
          commodity: effective.commodity,
          model: effective.model,
          params,
        })
        .then((res) => onEdit(res))
        .catch(console.error)
    }, 200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spot, band, amplitude, cycleYears])

  return (
    <div className="space-y-2.5 border-t pt-3 first:border-t-0 first:pt-0">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">{driver.name.replace(/_/g, ' ')}</span>
        <span className="font-mono text-[10px] text-muted-foreground">
          {effective.commodity}/{effective.model}
          {inherited && <span className="ml-1 text-muted-foreground">· inherited</span>}
        </span>
      </div>
      <label className="block">
        <span className="eyebrow flex justify-between">
          <span>spot (period 0)</span>
          <span className="font-mono text-foreground">${spot.toLocaleString()}</span>
        </span>
        <input
          type="range"
          min={10000}
          max={150000}
          step={1000}
          value={spot}
          onChange={(e) => setSpot(Number(e.target.value))}
          className="mt-1.5 w-full accent-[#f97316]"
        />
      </label>
      <label className="block">
        <span className="eyebrow">band</span>
        <select
          value={band}
          onChange={(e) => setBand(e.target.value)}
          className="mt-1 w-full rounded-md border bg-background px-2.5 py-1 text-sm capitalize"
        >
          {['support', 'fair', 'resistance'].map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="eyebrow flex justify-between">
          <span>amplitude</span>
          <span className="font-mono text-foreground">{amplitude}</span>
        </span>
        <input
          type="range"
          min={0}
          max={1.2}
          step={0.05}
          value={amplitude}
          onChange={(e) => setAmplitude(Number(e.target.value))}
          className="mt-1.5 w-full accent-[#f97316]"
        />
      </label>
      <label className="block">
        <span className="eyebrow flex justify-between">
          <span>cycle years</span>
          <span className="font-mono text-foreground">{cycleYears}</span>
        </span>
        <input
          type="range"
          min={2}
          max={8}
          step={0.5}
          value={cycleYears}
          onChange={(e) => setCycleYears(Number(e.target.value))}
          className="mt-1.5 w-full accent-[#f97316]"
        />
      </label>
    </div>
  )
}

/** The base scenario: named "base" (case-insensitive), else the first. */
function isBaseScenario(model: Model, scenarioId: string): boolean {
  const base = model.scenarios.find((s) => s.name.toLowerCase() === 'base') ?? model.scenarios[0]
  return base?.id === scenarioId
}
