import { lazy, Suspense, useEffect, useState } from 'react'
import { Boxes } from 'lucide-react'

import { api, type CommodityInfo, type PriceModelInfo } from '@/lib/api'
import { Card } from '@/components/ui/card'

// Keep recharts out of the main bundle; the preview chart loads on demand.
const PreviewChart = lazy(() =>
  import('@/components/PreviewChart').then((m) => ({ default: m.PreviewChart }))
)

/**
 * Read-only view of the commodity price-model registry. Lists each commodity, its
 * price models and default parameters, and an INTERACTIVE preview of each model's
 * price path — adjusting a control re-generates the preview (via the API), but
 * never changes the registry's stored defaults. Mounted at `/commodities`.
 */
export default function CommoditiesPage() {
  const [commodities, setCommodities] = useState<CommodityInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .commodities()
      .then(setCommodities)
      .catch((e) => setError(e.message))
  }, [])

  return (
    <div className="view-enter mx-auto max-w-[1100px] space-y-5 p-6">
      <div>
        <div className="eyebrow mb-1.5 flex items-center gap-1.5">
          <Boxes className="size-3.5" /> Commodities
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Price models</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
          Built-in commodity price models used to drive treasury and resource models. Adjust the
          controls to explore a model — this previews the shape only and never changes the defaults.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-[color-mix(in_oklch,var(--negative)_40%,transparent)] bg-[color-mix(in_oklch,var(--negative)_7%,transparent)] p-4 text-sm">
          {error}
        </div>
      )}

      {!commodities && !error && <div className="text-sm text-muted-foreground">Loading…</div>}

      {commodities?.map((c) => (
        <div key={c.id} className="space-y-3">
          <div className="flex items-baseline gap-2">
            <h2 className="text-lg font-semibold">{c.label}</h2>
            <span className="font-mono text-xs text-muted-foreground">{c.id}</span>
          </div>
          {c.models.map((m) => (
            <ModelCard key={m.id} commodityId={c.id} model={m} />
          ))}
        </div>
      ))}
    </div>
  )
}

/** One price model: its default params, interactive controls, and a live preview. */
function ModelCard({ commodityId, model }: { commodityId: string; model: PriceModelInfo }) {
  // Numeric params (exclude band, which is a select). Seed a spot so the phase is interesting.
  const numericDefaults: Record<string, number> = {}
  for (const [k, v] of Object.entries(model.defaultParams)) {
    if (typeof v === 'number') numericDefaults[k] = v
  }
  const [spot, setSpot] = useState<number>(62850)
  const [band, setBand] = useState<string>(String(model.defaultParams.band ?? 'fair'))
  const [nums, setNums] = useState<Record<string, number>>(numericDefaults)

  const [preview, setPreview] = useState<{ series: number[]; labels: string[] } | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  // Debounced regeneration whenever a control changes.
  useEffect(() => {
    let live = true
    const t = setTimeout(() => {
      const params: Record<string, number | string> = { ...nums, band, spot }
      api
        .commodityPreview(commodityId, model.id, params)
        .then((p) => live && (setPreview({ series: p.series, labels: p.labels }), setPreviewError(null)))
        .catch((e) => live && setPreviewError(e.message))
    }, 150)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [commodityId, model.id, spot, band, JSON.stringify(nums)])

  // Which numeric params to expose as sliders, with sensible ranges.
  const sliders: { key: string; min: number; max: number; step: number }[] = [
    { key: 'amplitude', min: 0, max: 1.2, step: 0.05 },
    { key: 'cycleYears', min: 2, max: 8, step: 0.5 },
  ].filter((s) => s.key in nums)

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <div className="font-medium">{model.label}</div>
        <span className="font-mono text-xs text-muted-foreground">{model.id}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* Interactive controls */}
        <div className="space-y-3">
          <NumberControl label="Spot (period 0)" value={spot} onChange={setSpot} step={1000} />
          <SelectControl
            label="Band"
            value={band}
            onChange={setBand}
            options={['support', 'fair', 'resistance']}
          />
          {sliders.map((s) => (
            <SliderControl
              key={s.key}
              label={s.key}
              value={nums[s.key]!}
              min={s.min}
              max={s.max}
              step={s.step}
              onChange={(v) => setNums((n) => ({ ...n, [s.key]: v }))}
            />
          ))}
          <ParamTable params={model.defaultParams} />
        </div>

        {/* Preview */}
        <div className="min-w-0">
          {previewError ? (
            <div className="grid h-[220px] place-items-center text-sm text-muted-foreground">
              {previewError}
            </div>
          ) : preview ? (
            <Suspense fallback={<div className="grid h-[220px] place-items-center text-sm text-muted-foreground">Loading chart…</div>}>
              <PreviewChart series={preview.series} labels={preview.labels} />
            </Suspense>
          ) : (
            <div className="grid h-[220px] place-items-center text-sm text-muted-foreground">Loading preview…</div>
          )}
        </div>
      </div>
    </Card>
  )
}

function NumberControl({
  label,
  value,
  onChange,
  step,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  step: number
}) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full rounded-md border bg-background px-2.5 py-1.5 font-mono text-sm"
      />
    </label>
  )
}

function SliderControl({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  return (
    <label className="block">
      <span className="eyebrow flex justify-between">
        <span>{label.replace(/([A-Z])/g, ' $1')}</span>
        <span className="font-mono text-foreground">{value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1.5 w-full accent-[#f97316]"
      />
    </label>
  )
}

function SelectControl({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: string[]
}) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border bg-background px-2.5 py-1.5 text-sm capitalize"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  )
}

/** The model's stored default parameters, shown read-only. */
function ParamTable({ params }: { params: Record<string, number | string> }) {
  return (
    <div className="rounded-md border">
      <div className="eyebrow border-b px-2.5 py-1.5">Defaults</div>
      <dl className="divide-y">
        {Object.entries(params).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2 px-2.5 py-1 font-mono text-xs">
            <dt className="text-muted-foreground">{k}</dt>
            <dd>{String(v)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
