import { NavLink, Outlet } from 'react-router-dom'
import { Cloud, Database, HardDrive, Palette, Plug, User } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { useSettings } from '@/settings/store'
import { useServerInfo } from '@/settings/useServerInfo'
import { cn } from '@/lib/utils'

const SECTIONS: { to: string; label: string; icon: LucideIcon }[] = [
  { to: 'preferences', label: 'Preferences', icon: Palette },
  { to: 'profile', label: 'Profile', icon: User },
  { to: 'cloud', label: 'Cloud connection', icon: Cloud },
  { to: 'data-sources', label: 'Data sources', icon: Database },
  { to: 'mcp', label: 'Connect MCP', icon: Plug },
]

/**
 * Account & Settings shell. Its own left sub-menu selects which section is
 * shown; each section (Preferences, Profile, Cloud, MCP) is a nested route
 * rendered in the Outlet. Local-first — nothing here is required to use the app.
 */
export default function SettingsLayout() {
  const { cloud } = useSettings()
  const { info, error } = useServerInfo()

  return (
    <div className="view-enter mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="eyebrow mb-1.5">Settings</div>
          <h1 className="text-xl font-semibold tracking-tight">Account</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Local-first — no login required. Preferences are stored on this device.
          </p>
        </div>
        <PostureBadge connected={cloud.connected} error={error} mode={info?.mode} />
      </div>

      <div className="flex flex-col gap-6 sm:flex-row">
        <nav className="flex shrink-0 flex-row gap-0.5 overflow-x-auto sm:w-52 sm:flex-col">
          {SECTIONS.map((s) => (
            <NavLink
              key={s.to}
              to={s.to}
              className={({ isActive }) =>
                cn(
                  'relative flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&_svg]:text-muted-foreground',
                  isActive &&
                    "bg-accent text-foreground [&_svg]:text-primary before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-primary before:content-['']"
                )
              }
            >
              <s.icon className="size-4" />
              {s.label}
            </NavLink>
          ))}
        </nav>

        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  )
}

function PostureBadge({
  connected,
  error,
  mode,
}: {
  connected: boolean
  error: string | null
  mode?: 'local' | 'cloud'
}) {
  if (error) return <Badge variant="destructive">Offline</Badge>
  if (connected) {
    return (
      <Badge variant="secondary" className="gap-1">
        <Cloud className="size-3.5" /> Cloud
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <HardDrive className="size-3.5" /> {mode === 'cloud' ? 'Gated' : 'Local'}
    </Badge>
  )
}
