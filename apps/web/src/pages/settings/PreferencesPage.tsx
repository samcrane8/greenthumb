import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSettings, setDisplay, type Theme, type NumberFormat } from '@/settings/store'
import { cn } from '@/lib/utils'

const THEMES: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

const NUMBER_FORMATS: { value: NumberFormat; label: string }[] = [
  { value: 'standard', label: 'Standard (1,234,567)' },
  { value: 'compact', label: 'Compact (1.2M)' },
]

/** `/settings/preferences` — appearance and number formatting. */
export default function PreferencesPage() {
  const { display } = useSettings()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Display preferences</CardTitle>
        <CardDescription>Appearance and number formatting.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>Theme</Label>
          <div className="flex gap-1 rounded-lg border bg-card p-1">
            {THEMES.map((t) => (
              <button
                key={t.value}
                onClick={() => setDisplay({ theme: t.value })}
                className={cn(
                  'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  display.theme === t.value
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-accent'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="currency">Currency</Label>
            <Input
              id="currency"
              value={display.currency}
              maxLength={3}
              className="uppercase"
              onChange={(e) => setDisplay({ currency: e.target.value.toUpperCase() })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="numberFormat">Number format</Label>
            <select
              id="numberFormat"
              value={display.numberFormat}
              onChange={(e) => setDisplay({ numberFormat: e.target.value as NumberFormat })}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {NUMBER_FORMATS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
